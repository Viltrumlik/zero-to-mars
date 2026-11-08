import { useRef, useState, type JSX, type ReactNode } from 'react';
import { sfx } from '../sound.ts';
import { haptic } from '../telegram.ts';
import { GameShell, L, clamp01, makeRng, pct, tr, useClock, useFx, useTimers, type Tx } from './common.tsx';
import { MINIGAME_DURATION, type MiniGameProps } from './types.ts';

const T = {
  name: L('Dasturlash', 'Программирование', 'Coding'),
  rules: [
    L(
      "Vazifani o'qing va kod qatorlarini to'g'ri tartibda bosing.",
      'Прочитайте задачу и нажимайте строки кода в правильном порядке.',
      'Read the task and tap the code lines in the right order.',
    ),
    L(
      "Chekinishlar (bo'shliqlar) qaysi qator qaysi blok ichida ekanini ko'rsatadi.",
      'Отступы показывают, какая строка внутри какого блока.',
      'Indentation shows which line sits inside which block.',
    ),
    L(
      "Noto'g'ri qator — jarima. Dastur tayyor bo'lsa, keyingisi keladi.",
      'Неверная строка — штраф. Готова программа — сразу следующая.',
      'A wrong line costs you. Finish a program and the next one arrives.',
    ),
  ],
  bugRule: L(
    "🐞 Har bir dasturda bitta xato (bug) qator bor — uni hech qachon bosmang!",
    '🐞 В каждой программе есть одна строка-баг — никогда не нажимайте её!',
    '🐞 Every program hides one buggy line — never tap it!',
  ),
  bugBanner: L('🐞 Bitta qator — bug. Uni ishlatmang!', '🐞 Одна строка — баг. Не используйте её!', '🐞 One line is a bug. Never use it!'),
  goal: L('{n} ta dastur', '{n} программ', '{n} programs'),
  task: L('Vazifa', 'Задача', 'Task'),
  hint: L("Keyingi qatorni bosing", 'Нажмите следующую строку', 'Tap the next line'),
  built: L('✓ Dastur ishladi!', '✓ Программа работает!', '✓ Build passed!'),
  bug: L('🐞 Bu bug edi!', '🐞 Это был баг!', '🐞 That was the bug!'),
  programs: L('Dasturlar', 'Программы', 'Programs'),
  wrong: L("Noto'g'ri qatorlar", 'Неверные строки', 'Wrong lines'),
};

interface Snip {
  task: Tx;
  code: string[];
  decoy: string;
}

/* Every program has exactly one valid order (checked by hand: no two independent lines can swap). */
const BANK: Snip[] = [
  // ---- 3 lines
  {
    task: L('1 dan n gacha sonlarni chiqaring', 'Выведите числа от 1 до n', 'Print the numbers from 1 to n'),
    code: ['n = 5', 'for i in range(1, n + 1):', '    print(i)'],
    decoy: 'for i in range(n):',
  },
  {
    task: L('Foydalanuvchini ismi bilan salomlang', 'Поприветствуйте пользователя по имени', 'Greet the user by name'),
    code: ['name = input()', 'msg = "Hi, " + name', 'print(msg)'],
    decoy: 'msg = "Hi, " + msg',
  },
  {
    task: L('Sonning kvadratini chiqaring', 'Выведите квадрат числа', 'Print the square of a number'),
    code: ['x = int(input())', 'sq = x * x', 'print(sq)'],
    decoy: 'sq = x + x',
  },
  {
    task: L('Son juftmi? True/False chiqaring', 'Чётное ли число? Выведите True/False', 'Is the number even? Print True/False'),
    code: ['n = int(input())', 'even = n % 2 == 0', 'print(even)'],
    decoy: 'even = n % 2 == 1',
  },
  {
    task: L("To'rtburchak yuzini hisoblang", 'Найдите площадь прямоугольника', 'Compute the area of a rectangle'),
    code: ['w, h = 4, 7', 'area = w * h', 'print(area)'],
    decoy: 'area = w + h',
  },
  {
    task: L('a va b qiymatlarini almashtiring', 'Поменяйте местами a и b', 'Swap the values of a and b'),
    code: ['tmp = a', 'a = b', 'b = tmp'],
    decoy: 'b = a',
  },
  {
    task: L("Selsiyni Farengeytga o'giring", 'Переведите Цельсий в Фаренгейт', 'Convert Celsius to Fahrenheit'),
    code: ['c = float(input())', 'f = c * 9 / 5 + 32', 'print(f)'],
    decoy: 'f = c * 5 / 9 + 32',
  },
  {
    task: L('Satrni teskari chiqaring', 'Выведите строку задом наперёд', 'Print the string reversed'),
    code: ['s = input()', 'r = s[::-1]', 'print(r)'],
    decoy: 'r = s[1:]',
  },
  // ---- 4 lines
  {
    task: L("Ro'yxat yig'indisini toping", 'Найдите сумму списка', 'Sum a list'),
    code: ['total = 0', 'for x in nums:', '    total += x', 'print(total)'],
    decoy: '    total -= x',
  },
  {
    task: L('3 dan 1 gacha teskari sanang', 'Обратный отсчёт от 3 до 1', 'Count down from 3 to 1'),
    code: ['n = 3', 'while n > 0:', '    print(n)', '    n -= 1'],
    decoy: '    n += 1',
  },
  {
    task: L("So'zni sikl bilan teskari aylantiring", 'Разверните слово с помощью цикла', 'Reverse a word with a loop'),
    code: ['r = ""', 'for ch in word:', '    r = ch + r', 'print(r)'],
    decoy: '    r = r + ch',
  },
  {
    task: L('5! (faktorial) ni hisoblang', 'Вычислите 5! (факториал)', 'Compute 5! (factorial)'),
    code: ['f = 1', 'for i in range(1, 6):', '    f *= i', 'print(f)'],
    decoy: '    f += i',
  },
  {
    task: L("Har bir sonni ikki barobar qiling", 'Удвойте каждое число', 'Double every number'),
    code: ['out = []', 'for x in nums:', '    out.append(x * 2)', 'print(out)'],
    decoy: '    out = x * 2',
  },
  {
    task: L('Fibonachchining 10 ta sonini chiqaring', 'Выведите 10 чисел Фибоначчи', 'Print 10 Fibonacci numbers'),
    code: ['a, b = 0, 1', 'for i in range(10):', '    print(a)', '    a, b = b, a + b'],
    decoy: '    a, b = a, a + b',
  },
  {
    task: L('Ikki sonning kattasini chiqaring', 'Выведите большее из двух чисел', 'Print the larger of two numbers'),
    code: ['if a > b:', '    print(a)', 'else:', '    print(b)'],
    decoy: 'if a < b:',
  },
  {
    task: L("20 dan kichik 3 ga karrali sonlarni chiqaring", 'Выведите числа, кратные 3, меньше 20', 'Print the multiples of 3 below 20'),
    code: ['i = 3', 'while i < 20:', '    print(i)', '    i += 3'],
    decoy: '    i -= 3',
  },
  // ---- 5 lines
  {
    task: L("Ro'yxatdagi eng katta sonni toping", 'Найдите максимум в списке', 'Find the max in a list'),
    code: ['best = nums[0]', 'for x in nums:', '    if x > best:', '        best = x', 'print(best)'],
    decoy: '    if x < best:',
  },
  {
    task: L('Matndagi unli harflarni sanang', 'Посчитайте гласные в тексте', 'Count the vowels in a text'),
    code: ['count = 0', 'for ch in text:', '    if ch in "aeiou":', '        count += 1', 'print(count)'],
    decoy: '        count = 1',
  },
  {
    task: L("Ro'yxatning o'rtachasini toping", 'Найдите среднее значение списка', 'Find the average of a list'),
    code: ['total = 0', 'for x in nums:', '    total += x', 'avg = total / len(nums)', 'print(avg)'],
    decoy: 'avg = total * len(nums)',
  },
  {
    task: L("10 dan sanab, raketani uchiring", 'Отсчёт с 10 и запуск ракеты', 'Count down from 10, then launch'),
    code: ['t = 10', 'while t > 0:', '    print(t)', '    t -= 1', 'print("Liftoff!")'],
    decoy: '    t += 1',
  },
  {
    task: L("Juft sonlar yig'indisini toping", 'Найдите сумму чётных чисел', 'Sum the even numbers'),
    code: ['total = 0', 'for x in nums:', '    if x % 2 == 0:', '        total += x', 'print(total)'],
    decoy: '    if x % 2 == 1:',
  },
  {
    task: L("3 harfdan uzun so'zlarni sanang", 'Посчитайте слова длиннее 3 букв', 'Count words longer than 3 letters'),
    code: ['n = 0', 'for w in text.split():', '    if len(w) > 3:', '        n += 1', 'print(n)'],
    decoy: '        n = len(w)',
  },
  {
    task: L("Son raqamlari yig'indisini toping", 'Найдите сумму цифр числа', 'Sum the digits of a number'),
    code: ['s = 0', 'while n > 0:', '    s += n % 10', '    n //= 10', 'print(s)'],
    decoy: '    n %= 10',
  },
  {
    task: L('Manfiy sonlarni olib tashlang', 'Уберите отрицательные числа', 'Remove the negative numbers'),
    code: ['clean = []', 'for x in nums:', '    if x >= 0:', '        clean.append(x)', 'print(clean)'],
    decoy: '        clean.append(-x)',
  },
  {
    task: L("Eng uzun so'zni toping", 'Найдите самое длинное слово', 'Find the longest word'),
    code: ['longest = ""', 'for w in words:', '    if len(w) > len(longest):', '        longest = w', 'print(longest)'],
    decoy: '        longest = len(w)',
  },
  // ---- 6 lines
  {
    task: L("So'z palindrommi? yes/no", 'Слово — палиндром? yes/no', 'Is the word a palindrome? yes/no'),
    code: ['word = input()', 'rev = word[::-1]', 'if word == rev:', '    print("yes")', 'else:', '    print("no")'],
    decoy: 'if word != rev:',
  },
  {
    task: L("Ro'yxatdan target o'rnini toping", 'Найдите позицию target в списке', 'Find the position of target in a list'),
    code: ['pos = -1', 'for i in range(len(nums)):', '    if nums[i] == target:', '        pos = i', '        break', 'print(pos)'],
    decoy: '    if nums[i] != target:',
  },
  {
    task: L('Hisobdan pul yeching (agar yetsa)', 'Снимите деньги со счёта (если хватает)', 'Withdraw money if the balance allows'),
    code: ['amount = int(input())', 'if amount <= balance:', '    balance -= amount', '    print("Left:", balance)', 'else:', '    print("Not enough")'],
    decoy: '    balance += amount',
  },
  {
    task: L("O'rtacha baho: o'tdimi yoki yo'q?", 'Средний балл: сдал или нет?', 'Average grade: pass or fail?'),
    code: ['total = sum(grades)', 'avg = total / len(grades)', 'if avg >= 60:', '    print("Pass")', 'else:', '    print("Fail")'],
    decoy: 'avg = total * len(grades)',
  },
  {
    task: L("100$ dan oshsa 10% chegirma bering", 'Скидка 10%, если сумма больше 100$', '10% discount if the total is over $100'),
    code: ['total = 0', 'for p in prices:', '    total += p', 'if total > 100:', '    total *= 0.9', 'print(total)'],
    decoy: '    total *= 1.1',
  },
  {
    task: L('Har bir harf necha marta uchrashini sanang', 'Посчитайте, сколько раз встречается каждая буква', 'Count how often each letter appears'),
    code: ['counts = {}', 'for ch in text:', '    if ch in counts:', '        counts[ch] += 1', '    else:', '        counts[ch] = 1'],
    decoy: '        counts[ch] = 0',
  },
  // ---- 7 lines
  {
    task: L('FizzBuzz: 3 ga — Fizz, 5 ga — Buzz, aks holda son', 'FizzBuzz: на 3 — Fizz, на 5 — Buzz, иначе число', 'FizzBuzz: Fizz for multiples of 3, Buzz for 5, else the number'),
    code: ['for i in range(1, 16):', '    if i % 3 == 0:', '        print("Fizz")', '    elif i % 5 == 0:', '        print("Buzz")', '    else:', '        print(i)'],
    decoy: '    elif i % 5 == 1:',
  },
  {
    task: L("Ballga qarab baho qo'ying: A / B / C", 'Поставьте оценку по баллам: A / B / C', 'Grade a score: A / B / C'),
    code: ['score = int(input())', 'if score >= 90:', '    grade = "A"', 'elif score >= 70:', '    grade = "B"', 'else:', '    grade = "C"'],
    decoy: 'elif score <= 70:',
  },
  {
    task: L('Son tub sonmi?', 'Является ли число простым?', 'Is the number prime?'),
    code: ['n = int(input())', 'prime = n > 1', 'for d in range(2, n):', '    if n % d == 0:', '        prime = False', '        break', 'print(prime)'],
    decoy: '    if n % d != 0:',
  },
  {
    task: L('Musbat va manfiy sonlarni sanang', 'Посчитайте положительные и отрицательные', 'Count positive and negative numbers'),
    code: ['pos, neg = 0, 0', 'for x in nums:', '    if x > 0:', '        pos += 1', '    elif x < 0:', '        neg += 1', 'print(pos, neg)'],
    decoy: '        neg -= 1',
  },
  {
    task: L('Yil kabisa yilimi?', 'Високосный ли год?', 'Is it a leap year?'),
    code: ['y = int(input())', 'if y % 400 == 0:', '    leap = True', 'elif y % 100 == 0:', '    leap = False', 'else:', '    leap = y % 4 == 0'],
    decoy: '    leap = y % 4 == 1',
  },
  {
    task: L('Har bir harorat uchun: Hot / Cold / OK', 'Для каждой температуры: Hot / Cold / OK', 'For each temperature: Hot / Cold / OK'),
    code: ['for t in temps:', '    if t > 30:', '        print("Hot")', '    elif t < 0:', '        print("Cold")', '    else:', '        print("OK")'],
    decoy: '    elif t > 0:',
  },
  {
    task: L('Harflarni sanab, natijani chiqaring', 'Посчитайте буквы и выведите результат', 'Count each letter and print the result'),
    code: ['counts = {}', 'for ch in text:', '    if ch in counts:', '        counts[ch] += 1', '    else:', '        counts[ch] = 1', 'print(counts)'],
    decoy: '        counts[ch] = 0',
  },
];

const LINES_BY_DIFF = [3, 4, 5, 5, 6, 7];

interface Line {
  id: number;
  indent: number;
  text: string;
  order: number; // -1 = decoy
}

interface Program {
  key: number;
  snip: Snip;
  lines: Line[]; // correct order (no decoy)
  pool: Line[]; // shuffled, includes decoy
}

function parse(src: string): { indent: number; text: string } {
  const m = /^( *)(.*)$/.exec(src)!;
  return { indent: Math.floor(m[1]!.length / 4), text: m[2]! };
}

const TOKEN =
  /("[^"]*")|(\b\d+(?:\.\d+)?\b)|(\b(?:for|in|if|elif|else|while|break|and|or|not|True|False)\b)|(\b(?:print|range|len|input|int|float|sum|append|split)\b)|([^"\w]+|\w+)/g;

function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    const cls = m[1] ? 'mg-tk-str' : m[2] ? 'mg-tk-num' : m[3] ? 'mg-tk-kw' : m[4] ? 'mg-tk-fn' : '';
    out.push(cls ? <span key={i++} className={cls}>{m[0]}</span> : m[0]);
  }
  return out;
}

function Code({ line }: { line: { indent: number; text: string } }) {
  return (
    <>
      {line.indent > 0 && <span className="mg-ind" style={{ width: `${line.indent * 1.3}em` }} />}
      <span className="mg-code-txt">{highlight(line.text)}</span>
    </>
  );
}

export function CodeGame({ difficulty: d, lang, seed, title, onDone, onQuit }: MiniGameProps): JSX.Element {
  const clock = useClock(MINIGAME_DURATION(d));
  const fx = useFx();
  const timers = useTimers();
  const [rng] = useState(() => makeRng(seed ^ 0x51ab7c0d));
  const len = LINES_BY_DIFF[d - 1]!;
  const withDecoy = d >= 4;
  const target = 1 + Math.ceil(d / 2);
  const pen = 0.04 + 0.01 * d;

  const [order] = useState(() => {
    const idx = BANK.map((s, i) => [s, i] as const).filter(([s]) => s.code.length === len).map(([, i]) => i);
    return rng.shuffle(idx);
  });
  const progN = useRef(0);

  const makeProgram = (): Program => {
    const k = progN.current++;
    const snip = BANK[order[k % order.length]!]!;
    const lines: Line[] = snip.code.map((src, i) => ({ id: i, order: i, ...parse(src) }));
    const all = withDecoy ? [...lines, { id: lines.length, order: -1, ...parse(snip.decoy) }] : lines;
    let pool = rng.shuffle(all);
    for (let tries = 0; tries < 5 && pool.every((l, i) => l.order === i || l.order === -1); tries++) pool = rng.shuffle(all);
    return { key: k, snip, lines, pool };
  };

  const [prog, setProg] = useState<Program>(makeProgram);
  const [placed, setPlaced] = useState(0);
  const [done, setDone] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [shake, setShake] = useState<{ id: number; k: number } | null>(null);
  const [built, setBuilt] = useState(false);
  const [bugMsg, setBugMsg] = useState(false);
  const shakeK = useRef(0);

  const playing = clock.phase === 'play' && !built;

  const tapLine = (line: Line) => {
    if (!playing) return;
    if (line.order === placed) {
      sfx.tap();
      haptic('light');
      const np = placed + 1;
      setPlaced(np);
      if (np === prog.lines.length) {
        setDone((v) => v + 1);
        setBuilt(true);
        sfx.success();
        haptic('success');
        fx.flash('ok');
        fx.float('+1 ✓', 'ok', 50, 40);
        timers.after(1000, () => {
          setProg(makeProgram());
          setPlaced(0);
          setBuilt(false);
          setBugMsg(false);
        });
      }
    } else {
      setWrong((w) => w + 1);
      shakeK.current += 1;
      const k = shakeK.current;
      setShake({ id: line.id, k });
      timers.after(450, () => setShake((s) => (s && s.k === k ? null : s)));
      if (line.order === -1) {
        setBugMsg(true);
        timers.after(1300, () => setBugMsg(false));
      }
      sfx.error();
      haptic('error');
      fx.flash('bad');
      fx.float(`−${pct(pen)}`, 'bad', 50, 40);
    }
  };

  const partial = placed / prog.lines.length;
  const score = clamp01(Math.min(1, (done + (built ? 0 : partial)) / target) - wrong * pen);
  const rules = withDecoy ? [...T.rules, T.bugRule] : T.rules;
  const remaining = prog.pool.filter((l) => l.order === -1 || l.order >= placed);
  // DEV-only hook for automated play-testing in the harness (stripped from production builds).
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mgCode = { lines: prog.lines.map((l) => l.text), placed };

  return (
    <GameShell
      lang={lang}
      title={title}
      difficulty={d}
      theme="code"
      icon="💻"
      name={T.name}
      rules={rules}
      goal={tr(T.goal, lang, { n: target })}
      clock={clock}
      fx={fx.node}
      score={score}
      breakdown={[
        [`📄 ${tr(T.programs, lang)}`, `${done} / ${target}`],
        [`❌ ${tr(T.wrong, lang)}`, wrong ? `${wrong} (−${pct(wrong * pen)})` : '0'],
      ]}
      hud={
        <>
          <span className="mg-chip">
            📄 {done}/{target}
          </span>
          {wrong > 0 && <span className="mg-chip mg-chip-bad">✕{wrong}</span>}
        </>
      }
      onDone={onDone}
      onQuit={onQuit}
    >
      <div className="mg-code" key={prog.key}>
        <div className="mg-task">
          <small>
            {tr(T.task, lang)} #{prog.key + 1}
          </small>
          <b>{tr(prog.snip.task, lang)}</b>
        </div>

        <div className={`mg-editor ${built ? 'mg-built' : ''}`}>
          <div className="mg-editor-bar">
            <i />
            <i />
            <i />
            <span>main.py</span>
          </div>
          {prog.lines.map((l, i) => (
            <div key={i} className={`mg-eline ${i < placed ? 'mg-eline-in' : i === placed ? 'mg-eline-cur' : ''}`}>
              <span className="mg-lno">{i + 1}</span>
              {i < placed ? <Code line={l} /> : i === placed && !built ? <span className="mg-caret" /> : null}
            </div>
          ))}
          {built && <div className="mg-built-msg">{tr(T.built, lang)}</div>}
        </div>

        {withDecoy && <div className={`mg-bugnote ${bugMsg ? 'mg-bugnote-hit' : ''}`}>{tr(bugMsg ? T.bug : T.bugBanner, lang)}</div>}

        <div className="mg-pool">
          {remaining.map((l) => (
            <button
              key={l.id}
              className={`mg-line ${shake && shake.id === l.id ? 'mg-line-bad' : ''} ${built && l.order === -1 ? 'mg-line-bug' : ''}`}
              onClick={() => tapLine(l)}
              disabled={!playing}
            >
              <Code line={l} />
            </button>
          ))}
        </div>
        {!built && <p className="mg-tip">👆 {tr(T.hint, lang)}</p>}
      </div>
    </GameShell>
  );
}

const questionFile = "./期末题目.md";
const answerFile = "./期末答案.md";
const wantedSections = new Map([
  ["单选题", "single"],
  ["多选题", "multiple"],
]);

const state = {
  filter: "all",
  query: "",
  answered: new Set(),
  questions: [],
};

const elements = {
  loading: document.querySelector("#loading"),
  questions: document.querySelector("#questions"),
  template: document.querySelector("#questionTemplate"),
  totalCount: document.querySelector("#totalCount"),
  answeredCount: document.querySelector("#answeredCount"),
  searchInput: document.querySelector("#searchInput"),
  tabs: [...document.querySelectorAll(".tab")],
};

init();

async function init() {
  try {
    const [questionMarkdown, answerMarkdown] = await Promise.all([
      fetchText(questionFile),
      fetchText(answerFile),
    ]);
    const questions = parseQuestions(questionMarkdown);
    const answers = parseAnswers(answerMarkdown);

    state.questions = questions.map((question) => ({
      ...question,
      answer: normalizeAnswer(answers.get(answerKey(question))),
    }));

    render();
    bindControls();
  } catch (error) {
    elements.loading.textContent = `题库载入失败：${error.message}`;
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} ${response.status}`);
  }
  return repairMojibake(await response.text());
}

function repairMojibake(text) {
  if (/##\s+(单选题|多选题)/.test(text)) return text;

  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    const byte = windows1252ReverseMap.get(code);
    if (byte !== undefined) {
      bytes.push(byte);
    } else if (code <= 0xff) {
      bytes.push(code);
    } else {
      return text;
    }
  }

  const repaired = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  return /##\s+(单选题|多选题)/.test(repaired) ? repaired : text;
}

const windows1252ReverseMap = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function parseQuestions(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const questions = [];
  let section = null;
  let current = null;
  let currentOption = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = wantedSections.get(heading[1].trim()) || null;
      current = null;
      currentOption = null;
      continue;
    }

    if (!section || !line) continue;

    const questionMatch = line.match(/^(\d+)[.、]\s*(.+)$/);
    if (questionMatch) {
      current = {
        id: `${section}-${questionMatch[1]}`,
        type: section,
        number: Number(questionMatch[1]),
        text: cleanText(questionMatch[2]),
        options: [],
      };
      questions.push(current);
      currentOption = null;
      continue;
    }

    const optionMatch = line.match(/^([A-H])\s*[.、]\s*(.+)$/i);
    if (current && optionMatch) {
      currentOption = {
        key: optionMatch[1].toUpperCase(),
        text: cleanText(optionMatch[2]),
      };
      current.options.push(currentOption);
      continue;
    }

    if (currentOption) {
      currentOption.text = cleanText(`${currentOption.text} ${line}`);
    } else if (current) {
      current.text = cleanText(`${current.text} ${line}`);
    }
  }

  return questions.filter((question) => question.options.length > 0);
}

function parseAnswers(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const answers = new Map();
  let section = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = wantedSections.get(heading[1].trim()) || null;
      continue;
    }
    if (!section || !line) continue;

    const answerMatch = line.match(/^(\d+)[.、]\s*(.+)$/);
    if (answerMatch) {
      answers.set(`${section}-${answerMatch[1]}`, answerMatch[2].trim());
    }
  }

  return answers;
}

function normalizeAnswer(value) {
  if (!value) {
    return { keys: [], uncertain: true, raw: "不确定" };
  }

  const trimmed = value.replace(/\s+/g, "").toUpperCase();
  const uncertain = /[?？]|略|不确定/.test(trimmed);
  const keys = [...new Set(trimmed.match(/[A-H]/g) || [])].sort();

  return {
    keys,
    uncertain: uncertain || keys.length === 0,
    raw: keys.length ? keys.join("") : "不确定",
  };
}

function answerKey(question) {
  return `${question.type}-${question.number}`;
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function bindControls() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.filter = tab.dataset.filter;
      elements.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      applyFilters();
    });
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    applyFilters();
  });
}

function render() {
  elements.loading.remove();
  elements.questions.textContent = "";
  elements.totalCount.textContent = `${state.questions.length} 题`;

  const fragment = document.createDocumentFragment();
  state.questions.forEach((question) => {
    fragment.appendChild(renderQuestion(question));
  });
  elements.questions.appendChild(fragment);
  updateAnsweredCount();
}

function renderQuestion(question) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  const typeText = question.type === "single" ? "单选题" : "多选题";
  card.dataset.type = question.type;
  card.dataset.searchText = `${question.text} ${question.options.map((option) => option.text).join(" ")}`.toLowerCase();
  card.querySelector(".badge").textContent = typeText;
  card.querySelector(".number").textContent = `第 ${question.number} 题`;
  card.querySelector("h2").textContent = question.text;

  const options = card.querySelector(".options");
  const inputType = question.type === "single" ? "radio" : "checkbox";
  const inputName = question.id;

  question.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "option";
    label.innerHTML = `
      <input type="${inputType}" name="${inputName}" value="${option.key}" />
      <span><span class="option-key">${option.key}.</span>${escapeHtml(option.text)}</span>
    `;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      label.classList.toggle("is-selected", input.checked);
      if (question.type === "single") {
        [...options.querySelectorAll(".option")].forEach((item) => {
          item.classList.toggle("is-selected", item.contains(input) && input.checked);
        });
      }
    });
    options.appendChild(label);
  });

  card.querySelector(".submit").addEventListener("click", () => submitAnswer(card, question));
  card.querySelector(".reset").addEventListener("click", () => resetQuestion(card, question));
  return card;
}

function submitAnswer(card, question) {
  const selected = selectedKeys(card);
  const result = card.querySelector(".result");
  state.answered.add(question.id);
  updateAnsweredCount();

  card.querySelectorAll("input").forEach((input) => {
    input.disabled = true;
    const option = input.closest(".option");
    option.classList.toggle("is-correct", question.answer.keys.includes(input.value));
    option.classList.toggle("is-wrong", input.checked && !question.answer.keys.includes(input.value));
  });

  if (question.answer.uncertain) {
    result.textContent = "正确答案：不确定";
    result.className = "result is-uncertain";
    return;
  }

  const correct = arraysEqual(selected, question.answer.keys);
  result.textContent = correct
    ? `回答正确。正确答案：${question.answer.raw}`
    : `回答错误。正确答案：${question.answer.raw}`;
  result.className = `result ${correct ? "is-right" : "is-wrong"}`;
}

function resetQuestion(card, question) {
  card.querySelectorAll("input").forEach((input) => {
    input.checked = false;
    input.disabled = false;
  });
  card.querySelectorAll(".option").forEach((option) => {
    option.classList.remove("is-selected", "is-correct", "is-wrong");
  });
  card.querySelector(".result").textContent = "";
  card.querySelector(".result").className = "result";
  state.answered.delete(question.id);
  updateAnsweredCount();
}

function selectedKeys(card) {
  return [...card.querySelectorAll("input:checked")]
    .map((input) => input.value)
    .sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function updateAnsweredCount() {
  elements.answeredCount.textContent = `已答 ${state.answered.size}`;
}

function applyFilters() {
  let visible = 0;
  elements.questions.querySelectorAll(".question-card").forEach((card) => {
    const typeMatched = state.filter === "all" || card.dataset.type === state.filter;
    const queryMatched = !state.query || card.dataset.searchText.includes(state.query);
    const show = typeMatched && queryMatched;
    card.classList.toggle("is-hidden", !show);
    if (show) visible += 1;
  });
  elements.totalCount.textContent = `${visible} / ${state.questions.length} 题`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

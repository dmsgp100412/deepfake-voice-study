import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://nmqxckngtcyuvpgcpkdj.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_y-fM3L47_JD4iRG2iUYj-Q_XunpLMvH';
const db = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
const app = document.querySelector('#single-app');
const STORAGE_KEY = 'voice-study-single-training1-v1';
const TOTAL_TRIALS = 40;
const SENTENCE = '높은 산에 올라가 맑은 공기를 마시며 소리를 지르면 가슴이 활짝 열리는 듯하다.';
const CONFIDENCE = [
  '전혀 확신하지 않음',
  '별로 확신하지 않음',
  '보통 정도로 확신함',
  '상당히 확신함',
  '매우 확신함'
];

let state = null;
let plays = 0;
let lastAudioEndedAt = null;
let firstChoiceAt = null;
let firstChosenLabel = null;

const $ = selector => app.querySelector(selector);
const $$ = selector => [...app.querySelectorAll(selector)];
const safeText = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const normalizeInitials = value => String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
const fmtMs = ms => `${(Number(ms) / 1000).toFixed(2)}초`;

function ageFromBirthDate(value) {
  const birth = new Date(`${value}T00:00:00`);
  if (!value || Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

function expectedAgeGroup(value) {
  const age = ageFromBirthDate(value);
  if (age >= 20 && age <= 29) return '20s';
  if (age >= 30 && age <= 39) return '30s';
  return null;
}

function participantCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return 'P-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), n => chars[n % chars.length]).join('');
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved?.version === 1 && saved?.experimentMode === 'single_training1' && Array.isArray(saved.order) && saved.order.length === TOTAL_TRIALS ? saved : null;
  } catch {
    return null;
  }
}

async function createState(participant) {
  const sessionId = crypto.randomUUID();
  const { data, error } = await db.rpc('create_single_trial_order', { p_session_id: sessionId });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== TOTAL_TRIALS) throw new Error('단일음성 문항 순서를 생성하지 못했습니다.');
  const order = data.map(item => ({
    pairId: Number(item.pairId),
    audioPath: String(item.audioPath || '')
  }));
  if (order.some(item => !item.pairId || !item.audioPath)) throw new Error('단일음성 문항 정보가 올바르지 않습니다.');
  return {
    version: 1,
    experimentMode: 'single_training1',
    sessionId,
    participantCode: participantCode(),
    participantInitials: participant.initials,
    birthDate: participant.birthDate,
    gender: participant.gender,
    ageGroup: participant.ageGroup,
    order,
    index: 0
  };
}

function renderIntro() {
  app.innerHTML = `
    <section class="single-hero">
      <div class="single-hero-main">
        <span class="eyebrow">Training 1 · Single voice</span>
        <h1>단일음성 <em>Real / AI</em><br>판별 실험</h1>
        <p>한 번에 하나의 음성을 듣고 해당 음성이 실제 사람이 녹음한 Real 음성인지, AI가 생성한 음성인지 판단합니다. 총 40개의 음성이 참가자마다 다른 무작위 순서로 제시됩니다.</p>
      </div>
      <div class="single-hero-side">
        <div class="single-fact"><strong>40</strong><span>단일음성<br>판별 문항</span></div>
        <div class="single-fact"><strong>2회</strong><span>음성별 최대<br>재생 횟수</span></div>
        <div class="single-fact"><strong>1–5</strong><span>답변<br>확신도</span></div>
      </div>
    </section>
    <section class="panel">
      <h2>실험 참여 안내</h2>
      <ol class="steps">
        <li>조용한 환경에서 이어폰 또는 헤드폰 사용을 권장합니다.</li>
        <li>각 음성은 최대 2회까지 들을 수 있으며, 음성 길이와 재생 진행 시간은 표시하지 않습니다.</li>
        <li>음성을 끝까지 들은 후에만 Real 음성 또는 AI 음성을 선택할 수 있습니다.</li>
        <li>반응시간은 마지막 음성 재생이 끝난 시점부터 Real/AI를 처음 선택한 시점까지 기록합니다.</li>
        <li>문항을 제출하면 이전 문항으로 돌아갈 수 없습니다.</li>
      </ol>
      <div class="consent-box">
        <h3>실험 참여 동의서</h3>
        <p>본 연구는 실제 음성과 AI 생성 음성을 얼마나 정확하게 구별할 수 있는지 분석하기 위한 청취 실험입니다.</p>
        <ul>
          <li>수집 항목: 영어 이니셜, 성별, 생년월일, 연령대, 익명 참가자 코드, 문항별 답변, 정오답, 확신도, 재생 횟수, 반응시간</li>
          <li>영어 이니셜과 생년월일은 동일 참가자를 구분하기 위한 목적으로만 사용합니다.</li>
          <li>연구 분석 시에는 이름 대신 무작위 참가자 코드를 사용하며, 데이터는 암호화된 통신을 통해 Supabase에 저장됩니다.</li>
          <li>수집된 자료는 익명화하여 연구 분석 및 통계 처리에 사용하고, 관리자 계정에서만 조회할 수 있습니다.</li>
          <li>참여자는 언제든 브라우저를 닫아 실험 참여를 중단할 수 있습니다.</li>
        </ul>
      </div>
      <div class="identity-grid">
        <label class="identity-field" for="single-initials">
          <strong>이름 (영어 이니셜)</strong>
          <span class="identity-help">영어 이니셜 2~6자만 입력해 주세요. 예: 홍길동 → HGD</span>
          <input class="text-field" id="single-initials" type="text" maxlength="6" autocomplete="off" placeholder="HGD">
        </label>
        <fieldset>
          <legend>성별</legend>
          <label class="demo-choice"><input type="radio" name="single-gender" value="male"><span>남성</span></label>
          <label class="demo-choice"><input type="radio" name="single-gender" value="female"><span>여성</span></label>
        </fieldset>
        <label class="identity-field" for="single-birth-date">
          <strong>생년월일</strong>
          <span class="identity-help">본인의 생년월일을 선택해 주세요.</span>
          <input class="text-field" id="single-birth-date" type="date" autocomplete="bday">
        </label>
        <fieldset>
          <legend>연령대</legend>
          <label class="demo-choice"><input type="radio" name="single-age" value="20s"><span>20대</span></label>
          <label class="demo-choice"><input type="radio" name="single-age" value="30s"><span>30대</span></label>
          <div class="identity-error" id="age-match-status"></div>
        </fieldset>
      </div>
      <label class="consent">
        <input id="single-consent" type="checkbox">
        <span>본인은 위 내용을 읽고 이해했으며, 실험 참여와 응답 데이터의 익명화·저장·연구 분석 및 통계 처리에 동의합니다.</span>
      </label>
      <button class="button primary" id="single-start" type="button" disabled>동의하고 단일음성 실험 시작하기 <span aria-hidden="true">→</span></button>
      <p class="status" id="single-intro-status" role="status"></p>
    </section>`;

  const initials = $('#single-initials');
  const birthDate = $('#single-birth-date');
  const start = $('#single-start');

  const validate = () => {
    initials.value = normalizeInitials(initials.value);
    const selectedAge = $('input[name="single-age"]:checked')?.value;
    const calculatedAge = expectedAgeGroup(birthDate.value);
    const mismatch = selectedAge && calculatedAge && selectedAge !== calculatedAge;
    $('#age-match-status').textContent = mismatch ? '생년월일과 선택한 연령대가 일치하지 않습니다.' : '';
    start.disabled = !(
      /^[A-Z]{2,6}$/.test(initials.value) &&
      $('input[name="single-gender"]:checked') &&
      birthDate.value && calculatedAge && selectedAge && !mismatch &&
      $('#single-consent').checked
    );
  };

  initials.addEventListener('input', validate);
  birthDate.addEventListener('change', validate);
  $$('input[name="single-gender"],input[name="single-age"]').forEach(input => input.addEventListener('change', validate));
  $('#single-consent').addEventListener('change', validate);

  start.addEventListener('click', async () => {
    const participant = {
      initials: normalizeInitials(initials.value),
      birthDate: birthDate.value,
      gender: $('input[name="single-gender"]:checked')?.value,
      ageGroup: $('input[name="single-age"]:checked')?.value
    };
    const calculatedAge = expectedAgeGroup(participant.birthDate);
    if (!/^[A-Z]{2,6}$/.test(participant.initials) || !participant.gender || !calculatedAge || participant.ageGroup !== calculatedAge || !$('#single-consent').checked) {
      $('#single-intro-status').textContent = '영어 이니셜, 성별, 생년월일, 연령대와 참여 동의를 모두 정확하게 입력해 주세요.';
      return;
    }
    start.disabled = true;
    start.textContent = '무작위 문항 순서 생성 중…';
    $('#single-intro-status').textContent = '';
    try {
      state = await createState(participant);
      saveState();
      renderTrial();
      scrollTo(0, 0);
    } catch (error) {
      state = null;
      start.disabled = false;
      start.textContent = '동의하고 단일음성 실험 시작하기 →';
      $('#single-intro-status').textContent = `실험을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요. (${error.message})`;
    }
  });
}

function renderTrial() {
  const item = state.order[state.index];
  plays = 0;
  lastAudioEndedAt = null;
  firstChoiceAt = null;
  firstChosenLabel = null;

  app.innerHTML = `
    <div class="single-trial-head">
      <strong>단일음성 문항 ${state.index + 1} / ${TOTAL_TRIALS}</strong>
      <span>참가자 ${safeText(state.participantCode)}</span>
    </div>
    <div class="progress-track" role="progressbar" aria-valuenow="${state.index}" aria-valuemin="0" aria-valuemax="${TOTAL_TRIALS}" aria-label="실험 진행률">
      <div class="progress-fill" style="width:${state.index / TOTAL_TRIALS * 100}%"></div>
    </div>
    <section class="single-audio-card">
      <span class="audio-letter">${String(state.index + 1).padStart(2, '0')}</span>
      <h2>음성을 끝까지 들어주세요.</h2>
      <blockquote class="sentence">“${SENTENCE}”</blockquote>
      <span class="audio-state" id="single-heard">끝까지 듣기 전 · 최대 2회</span>
      <audio id="single-audio" preload="none" src="${safeText(item.audioPath)}"></audio>
      <button class="play-audio" id="single-play" type="button" aria-label="단일 음성 재생">
        <span class="play-icon">▶</span><span id="single-play-label">음성 재생</span>
      </button>
      <p class="audio-caption">재생 버튼만 제공되며 음성 길이와 진행 시간은 표시하지 않습니다.</p>
    </section>
    <section class="panel single-question">
      <div class="question-title">이 음성은 Real 음성인가요, AI 음성인가요?</div>
      <p class="hint" id="single-listen-hint">음성을 끝까지 들은 후 답변할 수 있습니다.</p>
      <div class="single-choice-row">
        <div class="single-choice"><input type="radio" name="single-answer" id="answer-real" value="real" disabled><label for="answer-real">Real 음성 <span>실제 사람의 음성</span></label></div>
        <div class="single-choice"><input type="radio" name="single-answer" id="answer-ai" value="ai" disabled><label for="answer-ai">AI 음성 <span>Deepfake 음성</span></label></div>
      </div>
      <div class="divider"></div>
      <div class="question-title">그 답변에 얼마나 확신하나요?</div>
      <div class="scale" role="radiogroup" aria-label="답변 확신도">
        ${CONFIDENCE.map((label, index) => `<div><input type="radio" name="single-confidence" id="single-confidence-${index + 1}" value="${index + 1}" disabled><label for="single-confidence-${index + 1}"><strong>${index + 1}</strong><span>${label}</span></label></div>`).join('')}
      </div>
      <p class="hint" id="single-rt-hint">마지막 음성 종료 후 Real/AI를 처음 선택한 시점까지 반응시간을 기록합니다.</p>
    </section>
    <div class="action-row">
      <span class="muted">제출 후 이전 문항으로 돌아갈 수 없습니다.</span>
      <button class="button primary" id="single-next" type="button" disabled>${state.index === TOTAL_TRIALS - 1 ? '실험 완료하기' : '답변 저장하고 다음으로'} <span aria-hidden="true">→</span></button>
    </div>
    <p class="status" id="single-submit-status" role="status"></p>`;

  const audio = $('#single-audio');
  const playButton = $('#single-play');
  const playLabel = $('#single-play-label');

  const clearResponse = () => {
    firstChoiceAt = null;
    firstChosenLabel = null;
    $$('input[name="single-answer"],input[name="single-confidence"]').forEach(input => {
      input.checked = false;
      input.disabled = true;
    });
    $('#single-next').disabled = true;
  };

  const updateReady = () => {
    const ready = plays > 0 && audio.paused;
    $$('input[name="single-answer"],input[name="single-confidence"]').forEach(input => { input.disabled = !ready; });
    $('#single-listen-hint').textContent = ready ? '청취를 마쳤습니다. Real/AI와 확신도를 선택해 주세요.' : '음성을 끝까지 들은 후 답변할 수 있습니다.';
    $('#single-next').disabled = !(ready && $('input[name="single-answer"]:checked') && $('input[name="single-confidence"]:checked') && firstChoiceAt);
  };

  playButton.addEventListener('click', async () => {
    if (plays >= 2) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      $('#single-submit-status').textContent = '음성을 재생할 수 없습니다. 인터넷 연결과 브라우저 음량을 확인해 주세요.';
    }
  });

  audio.addEventListener('play', () => {
    clearResponse();
    playLabel.textContent = '음성 일시정지';
    playButton.classList.add('playing');
    $('#single-rt-hint').textContent = '음성이 끝난 후 첫 선택까지 반응시간을 기록합니다.';
  });

  audio.addEventListener('pause', () => {
    if (!audio.ended) {
      playLabel.textContent = '음성 이어듣기';
      playButton.classList.remove('playing');
    }
  });

  audio.addEventListener('ended', () => {
    plays = Math.min(2, plays + 1);
    lastAudioEndedAt = Date.now();
    clearResponse();
    $('#single-heard').textContent = plays >= 2 ? '2회 모두 들음' : '끝까지 들음 · 1/2회';
    $('#single-heard').classList.add('done');
    playButton.classList.remove('playing');
    if (plays >= 2) {
      playButton.disabled = true;
      playLabel.textContent = '음성 재생 완료 (2/2)';
    } else {
      playLabel.textContent = '음성 다시 재생 (1회 남음)';
    }
    updateReady();
  });

  audio.addEventListener('error', () => {
    $('#single-submit-status').textContent = '음성을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';
  });

  $$('input[name="single-answer"]').forEach(input => input.addEventListener('change', () => {
    if (!firstChoiceAt) {
      firstChoiceAt = Date.now();
      firstChosenLabel = input.value;
      $('#single-rt-hint').textContent = `첫 선택 반응시간: ${fmtMs(firstChoiceAt - lastAudioEndedAt)}`;
    }
    updateReady();
  }));
  $$('input[name="single-confidence"]').forEach(input => input.addEventListener('change', updateReady));
  $('#single-next').addEventListener('click', submitTrial);
}

async function submitTrial() {
  const chosenLabel = $('input[name="single-answer"]:checked')?.value;
  const confidence = Number($('input[name="single-confidence"]:checked')?.value);
  if (!chosenLabel || !confidence || !firstChoiceAt || !lastAudioEndedAt) return;
  const item = state.order[state.index];
  const responseMs = Math.max(0, Math.min(3600000, firstChoiceAt - lastAudioEndedAt));
  const next = $('#single-next');
  next.disabled = true;
  next.textContent = '저장 중…';

  const { error } = await db.rpc('submit_single_trial', {
    p_session_id: state.sessionId,
    p_participant_code: state.participantCode,
    p_participant_initials: state.participantInitials,
    p_birth_date: state.birthDate,
    p_gender: state.gender,
    p_age_group: state.ageGroup,
    p_trial_index: state.index + 1,
    p_pair_id: item.pairId,
    p_audio_path: item.audioPath,
    p_chosen_label: chosenLabel,
    p_confidence: confidence,
    p_response_ms: responseMs,
    p_plays: plays
  });

  if (error) {
    $('#single-submit-status').textContent = `응답 저장에 실패했습니다. 다시 시도해 주세요. (${error.message})`;
    next.disabled = false;
    next.textContent = '다시 저장하기';
    return;
  }

  state.index++;
  saveState();
  if (state.index >= TOTAL_TRIALS) renderDone();
  else renderTrial();
  scrollTo(0, 0);
}

function renderDone() {
  app.innerHTML = `
    <section class="panel center-panel">
      <div class="success-ring">✓</div>
      <span class="eyebrow">Single voice experiment complete</span>
      <h1>단일음성 판별 실험이 완료되었습니다.</h1>
      <p>총 ${TOTAL_TRIALS}개 음성에 대한 응답이 안전하게 저장되었습니다.<br>연구에 참여해 주셔서 감사합니다.</p>
      <p class="single-done-code">${safeText(state.participantInitials)} · 참가자 코드 ${safeText(state.participantCode)}</p>
      <button class="button secondary" id="single-reset" type="button">처음 화면으로 돌아가기</button>
    </section>`;
  $('#single-reset').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    state = null;
    renderIntro();
    scrollTo(0, 0);
  });
}

state = loadState();
if (!state) renderIntro();
else if (state.index >= TOTAL_TRIALS) renderDone();
else renderTrial();

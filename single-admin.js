import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://nmqxckngtcyuvpgcpkdj.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_y-fM3L47_JD4iRG2iUYj-Q_XunpLMvH';
const OWNER_EMAIL = 'dmsgp100412@gmail.com';
const db = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { detectSessionInUrl: true } });
const app = document.querySelector('#single-app');
let selectedSession = null;

const $ = selector => app.querySelector(selector);
const $$ = selector => [...app.querySelectorAll(selector)];
const safeText = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const avg = values => values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = values.map(Number).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—';
const fmt = value => value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(2);
const fmtMs = value => value == null ? '—' : `${(Number(value) / 1000).toFixed(2)}초`;
const genderLabel = value => value === 'male' ? '남성' : value === 'female' ? '여성' : '—';
const ageLabel = value => value === '20s' ? '20대' : value === '30s' ? '30대' : '—';
const voiceLabel = value => value === 'real' ? 'Real' : value === 'ai' ? 'AI' : '—';

function groupBySession(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.session_id)) groups.set(row.session_id, []);
    groups.get(row.session_id).push(row);
  }
  for (const group of groups.values()) group.sort((a, b) => a.trial_index - b.trial_index);
  return groups;
}

function completedGroups(groups) {
  return [...groups.values()].filter(rows => new Set(rows.map(row => row.trial_index)).size === 40);
}

function participantSummaries(completed) {
  return completed.map(rows => {
    const first = rows[0];
    const correct = rows.filter(row => row.is_correct).length;
    const real = rows.filter(row => row.actual_label === 'real');
    const ai = rows.filter(row => row.actual_label === 'ai');
    return {
      session_id: first.session_id,
      participant_code: first.participant_code,
      participant_initials: first.participant_initials,
      birth_date: first.birth_date,
      gender: first.gender,
      age_group: first.age_group,
      answered: rows.length,
      correct,
      accuracy: correct / rows.length,
      real_correct: real.filter(row => row.is_correct).length,
      real_total: real.length,
      ai_correct: ai.filter(row => row.is_correct).length,
      ai_total: ai.length,
      mean_confidence: avg(rows.map(row => row.confidence)),
      mean_rt_ms: avg(rows.map(row => row.response_ms)),
      median_rt_ms: median(rows.map(row => row.response_ms)),
      first_response_at: first.created_at
    };
  });
}

async function renderSingleAdmin() {
  document.querySelector('.header-note').textContent = '훈련 1 · 단일음성 관리자 통계';
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    app.innerHTML = `
      <section class="admin-wrap">
        <div class="admin-head"><div><span class="eyebrow">Single voice research dashboard</span><h1>단일음성 관리자 로그인</h1><p>관리자 이메일과 비밀번호로 로그인하면 단일음성 응답 통계를 확인할 수 있습니다.</p></div></div>
        <form class="panel login-panel" id="single-admin-login">
          <h2>관리자 로그인</h2>
          <label class="field-label" for="single-admin-email">이메일</label>
          <input class="text-field" id="single-admin-email" type="email" autocomplete="username" value="${OWNER_EMAIL}" required>
          <label class="field-label" for="single-admin-password">비밀번호</label>
          <input class="text-field" id="single-admin-password" type="password" autocomplete="current-password" required>
          <button class="button primary" id="single-admin-login-button" type="submit">관리자 통계 열기</button>
          <p class="status" id="single-admin-login-status" role="status"></p>
        </form>
      </section>`;
    $('#single-admin-login').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('#single-admin-login-button');
      button.disabled = true;
      button.textContent = '로그인 중…';
      const { error } = await db.auth.signInWithPassword({
        email: $('#single-admin-email').value.trim(),
        password: $('#single-admin-password').value
      });
      if (error) {
        $('#single-admin-login-status').textContent = '로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.';
        button.disabled = false;
        button.textContent = '관리자 통계 열기';
        return;
      }
      renderSingleAdmin();
    });
    return;
  }

  if (session.user.email !== OWNER_EMAIL) {
    app.innerHTML = '<section class="panel center-panel"><h1>접근 권한이 없습니다</h1><p>허용된 관리자 계정이 아닙니다.</p></section>';
    return;
  }

  app.innerHTML = '<div class="loading">단일음성 응답 통계를 불러오고 있습니다…</div>';
  try {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await db.from('single_responses').select('*').order('id', { ascending: true }).range(start, start + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    drawSingleDashboard(rows, session.user.email);
  } catch (error) {
    app.innerHTML = `<section class="panel center-panel"><h1>통계를 불러오지 못했습니다</h1><p>${safeText(error.message)}</p><button class="button secondary" id="single-admin-retry">다시 시도</button></section>`;
    $('#single-admin-retry').addEventListener('click', renderSingleAdmin);
  }
}

function drawSingleDashboard(allRows, email) {
  const groups = groupBySession(allRows);
  const completed = completedGroups(groups);
  const selectedRows = completed.flat();
  const summaries = participantSummaries(completed);
  const correct = selectedRows.filter(row => row.is_correct);
  const incorrect = selectedRows.filter(row => !row.is_correct);
  const actualReal = selectedRows.filter(row => row.actual_label === 'real');
  const actualAi = selectedRows.filter(row => row.actual_label === 'ai');
  const realCorrect = actualReal.filter(row => row.chosen_label === 'real').length;
  const aiCorrect = actualAi.filter(row => row.chosen_label === 'ai').length;
  const falseAi = actualReal.filter(row => row.chosen_label === 'ai').length;
  const falseReal = actualAi.filter(row => row.chosen_label === 'real').length;
  const realAccuracy = actualReal.length ? realCorrect / actualReal.length : null;
  const aiAccuracy = actualAi.length ? aiCorrect / actualAi.length : null;
  const balancedAccuracy = realAccuracy == null || aiAccuracy == null ? null : (realAccuracy + aiAccuracy) / 2;
  const maleCount = summaries.filter(summary => summary.gender === 'male').length;
  const femaleCount = summaries.filter(summary => summary.gender === 'female').length;

  if (!selectedSession || !completed.some(rows => rows[0]?.session_id === selectedSession)) selectedSession = completed[0]?.[0]?.session_id || null;
  const detailRows = selectedSession ? groups.get(selectedSession) || [] : [];
  const detail = detailRows[0] || null;

  const confidenceStats = [1, 2, 3, 4, 5].map(score => {
    const rows = selectedRows.filter(row => row.confidence === score);
    return { score, count: rows.length, correct: rows.filter(row => row.is_correct).length, accuracy: rows.length ? rows.filter(row => row.is_correct).length / rows.length : null };
  });

  const itemMap = new Map();
  for (const row of selectedRows) {
    const key = `${row.pair_id}-${row.actual_label}`;
    if (!itemMap.has(key)) itemMap.set(key, []);
    itemMap.get(key).push(row);
  }
  const itemStats = [...itemMap.entries()].map(([key, rows]) => {
    const [pairId, actualLabel] = key.split('-');
    const itemCorrect = rows.filter(row => row.is_correct).length;
    return {
      pair_id: Number(pairId),
      actual_label: actualLabel,
      total: rows.length,
      correct: itemCorrect,
      accuracy: rows.length ? itemCorrect / rows.length : null,
      mean_confidence: avg(rows.map(row => row.confidence)),
      mean_rt_ms: avg(rows.map(row => row.response_ms)),
      mean_plays: avg(rows.map(row => row.plays))
    };
  }).sort((a, b) => a.pair_id - b.pair_id || a.actual_label.localeCompare(b.actual_label));

  const participantRows = summaries.map(summary => `
    <tr class="${summary.session_id === selectedSession ? 'selected-row' : ''}">
      <td><strong>${safeText(summary.participant_initials)}</strong></td>
      <td><button class="link-button single-participant-detail" data-session="${summary.session_id}">${safeText(summary.participant_code)}</button></td>
      <td>${safeText(summary.birth_date)}</td>
      <td>${genderLabel(summary.gender)}</td>
      <td>${ageLabel(summary.age_group)}</td>
      <td>${summary.correct} / ${summary.answered}</td>
      <td>${pct(summary.correct, summary.answered)}</td>
      <td>${summary.real_correct} / ${summary.real_total}</td>
      <td>${summary.ai_correct} / ${summary.ai_total}</td>
      <td>${fmt(summary.mean_confidence)}</td>
      <td>${fmtMs(summary.mean_rt_ms)}</td>
      <td><button class="button secondary small single-delete-session" data-session="${summary.session_id}">전체 삭제</button></td>
    </tr>`).join('');

  const responseRows = detailRows.map(row => `
    <tr data-id="${row.id}">
      <td>${row.trial_index}</td>
      <td>${row.pair_id}</td>
      <td>${voiceLabel(row.actual_label)}</td>
      <td><select class="text-field small-field single-edit-label"><option value="real" ${row.chosen_label === 'real' ? 'selected' : ''}>Real</option><option value="ai" ${row.chosen_label === 'ai' ? 'selected' : ''}>AI</option></select></td>
      <td><select class="text-field small-field single-edit-confidence">${[1,2,3,4,5].map(score => `<option value="${score}" ${row.confidence === score ? 'selected' : ''}>${score}</option>`).join('')}</select></td>
      <td>${row.is_correct ? '정답' : '오답'}</td>
      <td>${fmtMs(row.response_ms)}</td>
      <td>${row.plays}</td>
      <td><button class="button secondary small single-save-row">저장</button> <button class="button secondary small single-delete-row">삭제</button></td>
    </tr>`).join('');

  const wrongRows = detailRows.filter(row => !row.is_correct);
  const itemRows = itemStats.map(item => `
    <tr><td>${item.pair_id}</td><td>${voiceLabel(item.actual_label)}</td><td>${item.total}</td><td>${pct(item.correct, item.total)}</td><td>${fmt(item.mean_confidence)}</td><td>${fmtMs(item.mean_rt_ms)}</td><td>${fmt(item.mean_plays)}</td></tr>`).join('');

  app.innerHTML = `
    <section class="admin-wrap">
      <div class="admin-head">
        <div><span class="eyebrow">Single voice research dashboard</span><h1>훈련 1 단일음성 응답 통계</h1><p>완료 참가자는 단일음성 40문항을 모두 제출한 세션입니다. 기존 A/B 비교실험 응답은 포함되지 않습니다.</p></div>
        <div class="admin-actions"><a class="button secondary small" href="single.html">참가자 페이지</a><button class="button secondary small" id="single-admin-refresh">새로고침</button><button class="button secondary small" id="single-download-xlsx">엑셀 다운로드</button><button class="button secondary small" id="single-admin-signout">로그아웃</button></div>
      </div>
      <div class="metric-grid single-admin-metrics">
        <div class="metric"><div class="label">완료 참가자</div><div class="value">${completed.length}</div><div class="detail">전체 세션 ${groups.size}개</div></div>
        <div class="metric gender-male"><div class="label">완료 남성</div><div class="value">${maleCount}</div><div class="detail">완료 참가자 기준</div></div>
        <div class="metric gender-female"><div class="label">완료 여성</div><div class="value">${femaleCount}</div><div class="detail">완료 참가자 기준</div></div>
        <div class="metric"><div class="label">전체 정답률</div><div class="value">${pct(correct.length, selectedRows.length)}</div><div class="detail">${correct.length} / ${selectedRows.length}문항</div></div>
        <div class="metric"><div class="label">Real 판별 정확도</div><div class="value">${pct(realCorrect, actualReal.length)}</div><div class="detail">실제 Real 중 Real 선택</div></div>
        <div class="metric"><div class="label">AI 판별 정확도</div><div class="value">${pct(aiCorrect, actualAi.length)}</div><div class="detail">실제 AI 중 AI 선택</div></div>
        <div class="metric"><div class="label">균형 정확도</div><div class="value">${balancedAccuracy == null ? '—' : `${(balancedAccuracy * 100).toFixed(1)}%`}</div><div class="detail">Real·AI 정확도 평균</div></div>
        <div class="metric"><div class="label">평균 반응시간</div><div class="value">${fmt(avg(selectedRows.map(row => row.response_ms / 1000)))}</div><div class="detail">초, 마지막 재생 종료 후</div></div>
      </div>
      <div class="stats-columns">
        <div class="panel analytics-panel"><h2>Real / AI 혼동행렬</h2><p class="sub">실제 음성과 참가자 선택 비교</p><table class="data-table compact-table"><thead><tr><th>실제 정답</th><th>Real 선택</th><th>AI 선택</th></tr></thead><tbody><tr><th>Real</th><td>${realCorrect}</td><td>${falseAi}</td></tr><tr><th>AI</th><td>${falseReal}</td><td>${aiCorrect}</td></tr></tbody></table><div class="stat-line"><span>Real을 AI로 오판</span><strong>${pct(falseAi, actualReal.length)}</strong></div><div class="stat-line"><span>AI를 Real로 오판</span><strong>${pct(falseReal, actualAi.length)}</strong></div></div>
        <div class="panel analytics-panel"><h2>정오답과 응답 특성</h2><p class="sub">완료 응답 기준</p><div class="stat-line"><span>정답일 때 평균 확신도</span><strong>${fmt(avg(correct.map(row => row.confidence)))}</strong></div><div class="stat-line"><span>오답일 때 평균 확신도</span><strong>${fmt(avg(incorrect.map(row => row.confidence)))}</strong></div><div class="stat-line"><span>정답일 때 평균 반응시간</span><strong>${fmtMs(avg(correct.map(row => row.response_ms)))}</strong></div><div class="stat-line"><span>오답일 때 평균 반응시간</span><strong>${fmtMs(avg(incorrect.map(row => row.response_ms)))}</strong></div><div class="stat-line"><span>전체 반응시간 중앙값</span><strong>${fmtMs(median(selectedRows.map(row => row.response_ms)))}</strong></div><div class="stat-line"><span>평균 재생 횟수</span><strong>${fmt(avg(selectedRows.map(row => row.plays)))}</strong></div></div>
      </div>
      <div class="panel analytics-panel"><h2>확신도별 정확도</h2><p class="sub">확신도와 실제 판별 정확도의 관계</p>${confidenceStats.map(item => `<div class="barline"><span>${item.score}점</span><div class="bar"><i style="width:${item.accuracy == null ? 0 : item.accuracy * 100}%"></i></div><strong>${item.count}건 · ${item.accuracy == null ? '—' : `${(item.accuracy * 100).toFixed(1)}%`}</strong></div>`).join('')}</div>
      <div class="panel analytics-panel"><h2>참가자별 통계</h2><div class="table-scroll"><table class="data-table single-participant-table"><thead><tr><th>이니셜</th><th>참가자 코드</th><th>생년월일</th><th>성별</th><th>연령대</th><th>정답</th><th>정답률</th><th>Real 정답</th><th>AI 정답</th><th>평균 확신도</th><th>평균 반응시간</th><th>관리</th></tr></thead><tbody>${participantRows || '<tr><td colspan="12" class="empty">완료 참가자가 없습니다.</td></tr>'}</tbody></table></div></div>
      <div class="panel analytics-panel"><h2>개인별 응답 상세</h2>${detail ? `
        <div class="admin-detail-head"><div><strong>${safeText(detail.participant_initials)} · ${safeText(detail.participant_code)}</strong><span class="muted"> · ${safeText(detail.session_id)}</span></div><div class="admin-actions"><input class="text-field small-field" id="single-edit-initials" value="${safeText(detail.participant_initials)}" maxlength="6"><input class="text-field small-field" id="single-edit-birth" type="date" value="${safeText(detail.birth_date)}"><select class="text-field small-field" id="single-edit-gender"><option value="male" ${detail.gender === 'male' ? 'selected' : ''}>남성</option><option value="female" ${detail.gender === 'female' ? 'selected' : ''}>여성</option></select><select class="text-field small-field" id="single-edit-age"><option value="20s" ${detail.age_group === '20s' ? 'selected' : ''}>20대</option><option value="30s" ${detail.age_group === '30s' ? 'selected' : ''}>30대</option></select><button class="button secondary small" id="single-save-participant">참가자 정보 저장</button></div></div>
        <div class="detail-summary-grid"><div class="detail-summary-card"><h3>틀린 문항 ${wrongRows.length}개</h3>${wrongRows.length ? `<div class="wrong-list">${wrongRows.map(row => `<span class="wrong-chip">${row.trial_index}번 · 세트 ${String(row.pair_id).padStart(2,'0')} · 정답 ${voiceLabel(row.actual_label)} · 선택 ${voiceLabel(row.chosen_label)} · 확신도 ${row.confidence}점</span>`).join('')}</div>` : '<p class="empty-inline">틀린 문항이 없습니다.</p>'}</div><div class="detail-summary-card"><h3>개인 요약</h3><div class="stat-line"><span>정답률</span><strong>${pct(detailRows.filter(row => row.is_correct).length, detailRows.length)}</strong></div><div class="stat-line"><span>평균 확신도</span><strong>${fmt(avg(detailRows.map(row => row.confidence)))}</strong></div><div class="stat-line"><span>평균 반응시간</span><strong>${fmtMs(avg(detailRows.map(row => row.response_ms)))}</strong></div></div></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>순서</th><th>세트</th><th>정답</th><th>선택</th><th>확신도</th><th>결과</th><th>반응시간</th><th>재생</th><th>관리</th></tr></thead><tbody>${responseRows}</tbody></table></div>` : '<div class="empty">선택된 참가자가 없습니다.</div>'}</div>
      <div class="panel analytics-panel"><h2>음성 문항별 결과</h2><div class="table-scroll"><table class="data-table"><thead><tr><th>세트</th><th>실제 음성</th><th>완료 응답</th><th>정답률</th><th>평균 확신도</th><th>평균 반응시간</th><th>평균 재생</th></tr></thead><tbody>${itemRows || '<tr><td colspan="7" class="empty">완료 응답이 없습니다.</td></tr>'}</tbody></table></div></div>
      <p class="note">반응시간은 마지막 음성 재생 종료 시점부터 Real/AI를 처음 선택한 시점까지입니다. 통계와 엑셀에는 40문항을 모두 완료한 참가자만 포함됩니다.</p>
      <p class="muted">인증 계정: ${safeText(email)}</p>
    </section>`;

  $('#single-admin-refresh').addEventListener('click', renderSingleAdmin);
  $('#single-admin-signout').addEventListener('click', async () => { await db.auth.signOut(); selectedSession = null; renderSingleAdmin(); });
  $('#single-download-xlsx').addEventListener('click', () => downloadSingleExcel(selectedRows, summaries, itemStats));
  $$('.single-participant-detail').forEach(button => button.addEventListener('click', () => { selectedSession = button.dataset.session; drawSingleDashboard(allRows, email); }));
  $$('.single-delete-session').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('이 참가자의 단일음성 응답 전체를 삭제할까요?')) return;
    const { error } = await db.rpc('admin_delete_single_session', { p_session_id: button.dataset.session });
    if (error) alert(error.message); else { selectedSession = null; renderSingleAdmin(); }
  }));
  $$('.single-save-row').forEach(button => button.addEventListener('click', async () => {
    const row = button.closest('tr');
    const { error } = await db.rpc('admin_update_single_response', {
      p_id: Number(row.dataset.id),
      p_chosen_label: row.querySelector('.single-edit-label').value,
      p_confidence: Number(row.querySelector('.single-edit-confidence').value)
    });
    if (error) alert(error.message); else renderSingleAdmin();
  }));
  $$('.single-delete-row').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('이 단일음성 응답 1건을 삭제할까요?')) return;
    const row = button.closest('tr');
    const { error } = await db.rpc('admin_delete_single_response', { p_id: Number(row.dataset.id) });
    if (error) alert(error.message); else renderSingleAdmin();
  }));
  if ($('#single-save-participant')) $('#single-save-participant').addEventListener('click', async () => {
    const initials = $('#single-edit-initials').value.toUpperCase().replace(/[^A-Z]/g, '');
    const { error } = await db.rpc('admin_update_single_participant', {
      p_session_id: selectedSession,
      p_participant_initials: initials,
      p_birth_date: $('#single-edit-birth').value,
      p_gender: $('#single-edit-gender').value,
      p_age_group: $('#single-edit-age').value
    });
    if (error) alert(error.message); else renderSingleAdmin();
  });
}

function downloadSingleExcel(rows, summaries, itemStats) {
  if (!window.XLSX) {
    alert('엑셀 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    return;
  }
  const participantSheet = summaries.map(summary => ({
    participant_initials: summary.participant_initials,
    participant_code: summary.participant_code,
    session_id: summary.session_id,
    birth_date: summary.birth_date,
    gender: genderLabel(summary.gender),
    age_group: ageLabel(summary.age_group),
    answered: summary.answered,
    correct: summary.correct,
    accuracy: summary.accuracy,
    real_correct: summary.real_correct,
    real_total: summary.real_total,
    real_accuracy: summary.real_total ? summary.real_correct / summary.real_total : null,
    ai_correct: summary.ai_correct,
    ai_total: summary.ai_total,
    ai_accuracy: summary.ai_total ? summary.ai_correct / summary.ai_total : null,
    mean_confidence: summary.mean_confidence,
    mean_rt_ms: summary.mean_rt_ms,
    median_rt_ms: summary.median_rt_ms,
    first_response_at: summary.first_response_at
  }));
  const rawColumns = ['id','session_id','participant_code','participant_initials','birth_date','gender','age_group','experiment_mode','trial_index','pair_id','audio_path','actual_label','chosen_label','is_correct','confidence','response_ms','plays','created_at'];
  const rawSheet = rows.map(row => Object.fromEntries(rawColumns.map(column => [column, row[column]])));
  const itemSheet = itemStats.map(item => ({
    pair_id: item.pair_id,
    actual_label: item.actual_label,
    completed_responses: item.total,
    correct: item.correct,
    accuracy: item.accuracy,
    mean_confidence: item.mean_confidence,
    mean_rt_ms: item.mean_rt_ms,
    mean_plays: item.mean_plays
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(participantSheet), 'participant_summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rawSheet), 'raw_responses');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemSheet), 'item_summary');
  XLSX.writeFile(workbook, 'single_training1_voice_experiment.xlsx');
}

if (location.hash === '#admin') renderSingleAdmin();

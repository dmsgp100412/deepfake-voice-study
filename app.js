import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://nmqxckngtcyuvpgcpkdj.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_y-fM3L47_JD4iRG2iUYj-Q_XunpLMvH';
const OWNER_EMAIL = 'dmsgp100412@gmail.com';
const db = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { detectSessionInUrl: true } });
const app = document.querySelector('#app');
const STORAGE_KEY = 'voice-study-v1';
const CONFIDENCE = ['전혀 확신하지 않음','별로 확신하지 않음','보통 정도로 확신함','상당히 확신함','매우 확신함'];
const SENTENCES = {
  1: '높은 산에 올라가 맑은 공기를 마시며 소리를 지르면 가슴이 활짝 열리는 듯하다.',
  2: '바닷가에 나가 조개를 주으며 넓게 펼쳐있는 바다를 바라보면 내 마음 역시 넓어지는 것 같다.'
};
let manifest = null;
let state = null;
let currentPlays = { A: 0, B: 0 };
let trialStartedAt = 0;
const $ = (selector) => app.querySelector(selector);
const pct = (n, d) => d ? `${(100*n/d).toFixed(1)}%` : '—';
const avg = values => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;
const fmt = n => n == null ? '—' : Number(n).toFixed(2);
const shuffle = arr => { const copy=[...arr]; for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]];} return copy; };
function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function load(){ try { const v=JSON.parse(localStorage.getItem(STORAGE_KEY)); return v?.version===1 && Array.isArray(v?.order) && v.order.length===40 ? v:null; } catch { return null; } }
function safeText(value){ return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function makeState(){
  const order=[1,2].flatMap(training=>shuffle(manifest.items.filter(x=>x.training===training)).map(x=>({training:x.training,pairId:x.pairId,files:Math.random()<.5?[...x.files].reverse():[...x.files]})));
  return {version:1,sessionId:crypto.randomUUID(),participantCode:'P-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[x%36]).join(''),order,index:0,consent:true,stage2Ready:false};
}
function adminRoute(){return location.hash==='#admin'||new URLSearchParams(location.search).get('admin')==='1'||sessionStorage.getItem('adminIntent')==='1'&&location.hash.includes('access_token');}
async function render(){ if(adminRoute()){await renderAdmin(); return;} if(!manifest){ try {const response=await fetch('manifest.json',{cache:'no-store'}); if(!response.ok) throw Error('목록을 가져올 수 없습니다.'); manifest=await response.json(); if(manifest.items.length!==40) throw Error('문항 구성이 올바르지 않습니다.');} catch(e){app.innerHTML=`<div class="panel center-panel"><h1>실험을 열 수 없습니다</h1><p>${safeText(e.message)}</p></div>`;return;} } state=load(); if(!state) return renderIntro(); if(state.index>=40) return renderDone(); if(state.index===20&&!state.stage2Ready) return renderInterlude(); renderTrial(); }
function renderIntro(){
  app.innerHTML=`<section class="hero"><span class="eyebrow">Listening perception study</span><h1>당신은 <em>AI의 목소리</em>를<br>구분할 수 있나요?</h1><p class="lead">두 음성을 듣고 AI가 생성한 목소리를 골라주세요. 같은 문장을 읽는 A와 B를 비교합니다. 훈련 1과 훈련 2를 한 번에 진행하며, 정답은 실험 중 공개되지 않습니다.</p></section>
  <div class="intro-grid"><div class="mini-card"><b>02</b><span>훈련 단계</span></div><div class="mini-card"><b>40</b><span>음성 비교 문항 (각 단계 20개)</span></div><div class="mini-card"><b>01–05</b><span>답변 확신도</span></div></div>
  <section class="panel"><h2>참여 전 안내</h2><ol class="steps"><li>조용한 곳에서 이어폰 또는 스피커를 사용하고 음량을 편하게 맞춰주세요.</li><li>각 문항에서 A와 B를 모두 <strong>끝까지</strong> 들은 뒤 AI 음성을 선택합니다. 필요하면 다시 들어도 됩니다.</li><li>선택에 대한 확신도를 1점부터 5점까지 표시해 주세요. 정답 피드백은 제공하지 않습니다.</li><li>두 훈련은 순서대로 진행되고, 각 훈련의 문항 순서와 A/B 배치는 참여자마다 무작위입니다.</li></ol><p class="muted">이름·연락처는 수집하지 않으며 무작위 참가자 코드와 문항별 선택, 확신도, 재생 횟수, 응답 시간만 저장합니다. 연구 목적의 분석에 사용됩니다. 브라우저를 닫아도 같은 기기에서는 이어서 참여할 수 있습니다.</p><label class="consent"><input id="consent" type="checkbox"><span>위 내용을 읽고 이해했으며, 익명 응답의 연구 목적 저장에 동의합니다.</span></label><button id="start" class="button primary" disabled>실험 시작하기 <span aria-hidden="true">→</span></button></section>`;
  $('#consent').addEventListener('change',e=>$('#start').disabled=!e.target.checked);
  $('#start').addEventListener('click',()=>{state=makeState(); save(); renderTrial(); window.scrollTo(0,0);});
}
function renderTrial(){
  const item=state.order[state.index]; const stageIndex=state.index%20+1; currentPlays={A:0,B:0}; trialStartedAt=Date.now();
  app.innerHTML=`<div class="progress-top"><span class="stage-pill">훈련 ${item.training} · ${stageIndex} / 20</span><span>전체 ${state.index+1} / 40</span></div><div class="progress-track" role="progressbar" aria-valuenow="${state.index}" aria-valuemin="0" aria-valuemax="40" aria-label="실험 진행률"><div class="progress-fill" style="width:${state.index/40*100}%"></div></div>
  <h1 class="trial-title">두 목소리를 비교해 주세요.</h1><p class="trial-subtitle">같은 문장을 읽는 두 음성입니다. 순서는 정답과 관계없이 무작위로 표시됩니다.</p><blockquote class="sentence">“${SENTENCES[item.training]}”</blockquote>
  <div class="audio-grid">${['A','B'].map((side,i)=>`<div class="audio-card"><div class="audio-head"><span class="audio-letter">${side}</span><span class="audio-state" id="heard-${side}">끝까지 듣기 전</span></div><audio id="audio-${side}" preload="none" src="${item.files[i]}"></audio><button type="button" class="play-audio" id="play-${side}" aria-label="음성 ${side} 재생"><span class="play-icon">▶</span><span id="play-label-${side}">음성 ${side} 재생</span></button><p class="audio-caption">재생 버튼만 제공되며, 음성 길이와 진행 시간은 표시하지 않습니다.</p></div>`).join('')}</div>
  <section class="panel question-panel"><div class="question-title">어느 쪽이 AI가 생성한 음성인가요?</div><p id="listen-hint" class="hint">답하려면 A와 B를 각각 끝까지 한 번씩 들어주세요.</p><div class="choice-row">${['A','B'].map(side=>`<div class="choice"><input type="radio" name="answer" id="answer-${side}" value="${side}" disabled><label for="answer-${side}">음성 ${side}가 AI</label></div>`).join('')}</div><div class="divider"></div><div class="question-title">그 답변에 얼마나 확신하나요?</div><p class="hint">1점은 전혀 확신하지 않음, 5점은 매우 확신함을 뜻합니다.</p><div class="scale" role="radiogroup" aria-label="답변 확신도">${CONFIDENCE.map((label,i)=>`<div><input type="radio" name="confidence" id="confidence-${i+1}" value="${i+1}" disabled><label for="confidence-${i+1}"><strong>${i+1}</strong><span>${label}</span></label></div>`).join('')}</div></section>
  <div class="action-row"><span class="muted">답변은 제출 후 수정할 수 없습니다. 각 문항은 제출할 때 Supabase에 저장됩니다.</span><button id="next" class="button primary" disabled>${state.index===39?'실험 완료하기':'답변 저장하고 다음으로'} <span aria-hidden="true">→</span></button></div><p id="submit-status" class="status" role="status"></p>`;
  const audioA=$('#audio-A'),audioB=$('#audio-B');
  for(const [side,audio,other] of [['A',audioA,audioB],['B',audioB,audioA]]){
    const button=$(`#play-${side}`), label=$(`#play-label-${side}`);
    const otherSide=side==='A'?'B':'A';
    button.addEventListener('click',async()=>{try{if(audio.paused){await audio.play();}else{audio.pause();}}catch(e){$('#submit-status').textContent='음성을 재생할 수 없습니다. 브라우저 음량과 인터넷 연결을 확인해 주세요.';}});
    audio.addEventListener('play',()=>{if(!other.paused)other.pause(); label.textContent=`음성 ${side} 일시정지`; button.classList.add('playing'); const otherLabel=$(`#play-label-${otherSide}`); if(otherLabel) otherLabel.textContent=`음성 ${otherSide} 재생`; const otherButton=$(`#play-${otherSide}`); if(otherButton) otherButton.classList.remove('playing');});
    audio.addEventListener('pause',()=>{if(!audio.ended){label.textContent=`음성 ${side} 재생`; button.classList.remove('playing');}});
    audio.addEventListener('ended',()=>{currentPlays[side]++; $(`#heard-${side}`).textContent=`끝까지 들음 · ${currentPlays[side]}회`; $(`#heard-${side}`).classList.add('done'); label.textContent=`음성 ${side} 다시 재생`; button.classList.remove('playing'); updateChoice();});
    audio.addEventListener('error',()=>{$('#submit-status').textContent='음성을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';});
  }
  for(const radio of app.querySelectorAll('input[type=radio]')) radio.addEventListener('change',updateChoice);
  $('#next').addEventListener('click',submitTrial);
}
function updateChoice(){
  const ready=currentPlays.A>0&&currentPlays.B>0;
  for(const radio of app.querySelectorAll('input[type=radio]'))radio.disabled=!ready;
  $('#listen-hint').textContent=ready?'두 음성 청취를 마쳤습니다. AI 음성과 확신도를 골라주세요.':'답하려면 A와 B를 각각 끝까지 한 번씩 들어주세요.';
  $('#next').disabled=!(ready&&$('input[name=answer]:checked')&&$('input[name=confidence]:checked'));
}
async function submitTrial(){
  const answer=$('input[name=answer]:checked')?.value, confidence=Number($('input[name=confidence]:checked')?.value);
  if(!answer||!confidence||!currentPlays.A||!currentPlays.B)return;
  const item=state.order[state.index]; const btn=$('#next'); btn.disabled=true; btn.textContent='저장 중…';
  const {error}=await db.rpc('submit_trial',{p_session_id:state.sessionId,p_participant_code:state.participantCode,p_training:item.training,p_pair_id:item.pairId,p_trial_index:state.index+1,p_a_path:item.files[0],p_b_path:item.files[1],p_chosen_side:answer,p_confidence:confidence,p_response_ms:Math.min(3600000,Date.now()-trialStartedAt),p_a_plays:currentPlays.A,p_b_plays:currentPlays.B});
  if(error){$('#submit-status').textContent=`저장에 실패했습니다. 연결을 확인하고 다시 시도해 주세요. (${error.message})`; btn.disabled=false; btn.textContent='다시 저장하기'; return;}
  state.index++; save(); if(state.index===20) renderInterlude(); else if(state.index===40) renderDone(); else renderTrial(); window.scrollTo(0,0);
}
function renderInterlude(){app.innerHTML=`<section class="panel center-panel"><div class="success-ring">✓</div><span class="eyebrow">Training 01 complete</span><h1>훈련 1을 마쳤습니다.</h1><p>첫 번째 문장의 20개 비교가 모두 저장되었습니다.<br>잠시 쉬어도 좋습니다. 다음은 다른 문장을 읽는 <strong>훈련 2</strong>입니다.</p><button class="button primary" id="stage2">훈련 2 시작하기 →</button><p class="muted">참가자 코드: ${safeText(state.participantCode)}</p></section>`;$('#stage2').addEventListener('click',()=>{state.stage2Ready=true;save();renderTrial();window.scrollTo(0,0);});}
function renderDone(){app.innerHTML=`<section class="panel center-panel"><div class="success-ring">✓</div><span class="eyebrow">Study complete</span><h1>참여해 주셔서 감사합니다.</h1><p>훈련 1과 훈련 2의 모든 답변이 저장되었습니다.<br>정답은 실험 결과의 편향을 막기 위해 화면에 공개하지 않습니다.</p><p class="muted">참가자 코드: ${safeText(state.participantCode)}</p></section>`;}

async function renderAdmin(){
  sessionStorage.setItem('adminIntent','1');
  const {data:{session}}=await db.auth.getSession();
  if(!session){app.innerHTML=`<section class="admin-wrap"><div class="admin-head"><div><span class="eyebrow">Research dashboard</span><h1>연구자 통계</h1><p>응답 원자료와 집계는 인증된 연구자만 볼 수 있습니다.</p></div></div><form class="panel login-panel" id="admin-login"><h2>연구자 로그인</h2><p class="admin-locked">등록된 연구자 이메일과 비밀번호를 입력하면 바로 통계를 볼 수 있습니다. <a href="./">실험 화면으로 돌아가기</a></p><label class="field-label" for="admin-email">이메일</label><input class="text-field" id="admin-email" type="email" autocomplete="username" value="${OWNER_EMAIL}" required><label class="field-label" for="admin-password">비밀번호</label><input class="text-field" id="admin-password" type="password" autocomplete="current-password" required><button class="button primary" id="admin-login-button" type="submit">통계 로그인</button><p id="login-status" class="status" role="status"></p></form></section>`;$('#admin-login').addEventListener('submit',async(e)=>{e.preventDefault();const btn=$('#admin-login-button');btn.disabled=true;btn.textContent='로그인 중…';const email=$('#admin-email').value.trim();const password=$('#admin-password').value;const {error}=await db.auth.signInWithPassword({email,password});if(error){$('#login-status').textContent='로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.';btn.disabled=false;btn.textContent='통계 로그인';return;}sessionStorage.removeItem('adminIntent');renderAdmin();});return;}
  if(session.user.email!==OWNER_EMAIL){app.innerHTML='<section class="panel center-panel"><h1>접근 권한이 없습니다</h1><p>이 계정은 통계 열람 권한이 없습니다.</p></section>';return;}
  app.innerHTML='<div class="loading">응답을 불러오고 있습니다…</div>';
  try{
    const rows=[]; for(let start=0;;start+=1000){const {data,error}=await db.from('responses').select('*').order('id',{ascending:true}).range(start,start+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}
    drawDashboard(rows,session.user.email);
  }catch(e){app.innerHTML=`<section class="panel center-panel"><h1>통계를 불러오지 못했습니다</h1><p>${safeText(e.message)}</p><button class="button secondary" id="retry">다시 시도</button></section>`;$('#retry').addEventListener('click',renderAdmin);}
}
function bootstrapCI(participantValues){if(participantValues.length<2)return '표본 부족';let seed=17431;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const means=[];for(let b=0;b<2000;b++){let sum=0;for(let i=0;i<participantValues.length;i++)sum+=participantValues[Math.floor(rand()*participantValues.length)];means.push(sum/participantValues.length);}means.sort((a,b)=>a-b);return `${fmt(means[49])}–${fmt(means[1949])}`;}
function csvCell(value){return '"'+String(value??'').replaceAll('"','""')+'"';}
function downloadCSV(filename,rows){const body='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([body],{type:'text/csv;charset=utf-8'}));link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
function drawDashboard(all,email){
  const groups=new Map();for(const row of all){if(!groups.has(row.session_id))groups.set(row.session_id,[]);groups.get(row.session_id).push(row);}
  const complete=[...groups.values()].filter(rows=>rows.length===40&&new Set(rows.map(r=>r.training+'-'+r.pair_id)).size===40);
  const selected=complete.flat(); const n=complete.length, partial=groups.size-n;const correct=selected.filter(r=>r.is_correct);
  const scores=complete.map(rows=>rows.filter(r=>r.is_correct).length/40);
  const stageScores=stage=>complete.map(rows=>rows.filter(r=>r.training===stage&&r.is_correct).length/20);
  const s1=stageScores(1),s2=stageScores(2);const diff=s2.map((value,i)=>value-s1[i]);
  const rowsStage=stage=>selected.filter(r=>r.training===stage);const bySide=side=>selected.filter(r=>r.ai_side===side);
  const confidenceCounts=[1,2,3,4,5].map(x=>selected.filter(r=>r.confidence===x).length);
  const stagePanel=(stage,score)=>{const rows=rowsStage(stage);return `<div class="panel analytics-panel"><h2>훈련 ${stage}</h2><p class="sub">문장 ${stage} · 참여자당 20문항</p><div class="stat-line"><span>평균 정답률 (참가자 기준)</span><strong>${pct(rows.filter(r=>r.is_correct).length,rows.length)}</strong></div><div class="stat-line"><span>95% 부트스트랩 구간</span><strong>${bootstrapCI(score)}</strong></div><div class="stat-line"><span>평균 확신도</span><strong>${fmt(avg(rows.map(r=>r.confidence)))} / 5</strong></div><div class="stat-line"><span>평균 응답 시간</span><strong>${fmt(avg(rows.map(r=>r.response_ms/1000)))}초</strong></div></div>`;};
  const itemRows=[1,2].flatMap(stage=>[...new Set(all.filter(r=>r.training===stage).map(r=>r.pair_id))].sort((a,b)=>a-b).map(pair=>{const rows=selected.filter(r=>r.training===stage&&r.pair_id===pair);return `<tr><td>훈련 ${stage}</td><td>${pair}</td><td>${rows.length}</td><td>${pct(rows.filter(r=>r.is_correct).length,rows.length)}</td><td>${fmt(avg(rows.map(r=>r.confidence)))}</td><td>${rows.filter(r=>r.ai_side==='A').length} / ${rows.filter(r=>r.ai_side==='B').length}</td></tr>`;})).join('');
  const participants=complete.map(rows=>{const first=rows[0];return `<tr><td>${safeText(first.participant_code)}</td><td>${rows.filter(r=>r.training===1&&r.is_correct).length} / 20</td><td>${rows.filter(r=>r.training===2&&r.is_correct).length} / 20</td><td>${rows.filter(r=>r.is_correct).length} / 40</td><td>${fmt(avg(rows.map(r=>r.confidence)))}</td><td>${rows.filter(r=>r.chosen_side==='A').length} / 40</td><td>${new Date(first.created_at).toLocaleDateString('ko-KR')}</td></tr>`;}).join('');
  app.innerHTML=`<section class="admin-wrap"><div class="admin-head"><div><span class="eyebrow">Research dashboard · private</span><h1>실험 응답 통계</h1><p>완료한 참가자만 주요 통계에 포함합니다. 원자료 CSV에는 미완료 응답도 보존됩니다.</p></div><div class="admin-actions"><button class="button secondary small" id="refresh">새로고침</button><button class="button secondary small" id="export">원자료 CSV</button><button class="button secondary small" id="export-summary">참가자 요약 CSV</button><button class="button secondary small" id="signout">로그아웃</button></div></div>
  <div class="metric-grid"><div class="metric"><div class="label">완료 참가자</div><div class="value">${n}</div><div class="detail">미완료 ${partial}명은 주요 분석 제외</div></div><div class="metric"><div class="label">전체 정답률</div><div class="value">${pct(correct.length,selected.length)}</div><div class="detail">${correct.length} / ${selected.length}문항</div></div><div class="metric"><div class="label">평균 확신도</div><div class="value">${fmt(avg(selected.map(r=>r.confidence)))}</div><div class="detail">5점 척도</div></div><div class="metric"><div class="label">훈련 2 − 훈련 1</div><div class="value">${diff.length?`${(avg(diff)*100).toFixed(1)}%p`:'—'}</div><div class="detail">참가자 내 정답률 차이</div></div></div>
  <div class="stats-columns">${stagePanel(1,s1)}${stagePanel(2,s2)}</div>
  <div class="stats-columns"><div class="panel analytics-panel"><h2>정답과 확신도</h2><p class="sub">확신도는 1–5점의 순서형 응답입니다.</p><div class="stat-line"><span>정답일 때 평균 확신도</span><strong>${fmt(avg(correct.map(r=>r.confidence)))}</strong></div><div class="stat-line"><span>오답일 때 평균 확신도</span><strong>${fmt(avg(selected.filter(r=>!r.is_correct).map(r=>r.confidence)))}</strong></div><div class="stat-line"><span>AI가 A일 때 정답률</span><strong>${pct(bySide('A').filter(r=>r.is_correct).length,bySide('A').length)}</strong></div><div class="stat-line"><span>AI가 B일 때 정답률</span><strong>${pct(bySide('B').filter(r=>r.is_correct).length,bySide('B').length)}</strong></div><div class="stat-line"><span>A를 AI로 선택한 비율</span><strong>${pct(selected.filter(r=>r.chosen_side==='A').length,selected.length)}</strong></div></div><div class="panel analytics-panel"><h2>확신도 분포</h2><p class="sub">완료 응답 ${selected.length}건 기준</p>${confidenceCounts.map((count,i)=>`<div class="barline"><span>${i+1}점</span><div class="bar"><i style="width:${selected.length?100*count/selected.length:0}%"></i></div><strong>${count}건</strong></div>`).join('')}</div></div>
  <div class="panel analytics-panel"><h2>문항별 결과</h2><p class="sub">문항 난이도와 A/B 배치 균형을 점검할 수 있습니다.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>훈련</th><th>세트</th><th>완료 응답 수</th><th>정답률</th><th>평균 확신도</th><th>AI 위치 A/B</th></tr></thead><tbody>${itemRows}</tbody></table></div></div>
  <div class="panel analytics-panel"><h2>참가자별 요약</h2><p class="sub">한 행은 완료 참가자 한 명입니다.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>참가자 코드</th><th>훈련 1 정답</th><th>훈련 2 정답</th><th>전체 정답</th><th>평균 확신도</th><th>A 선택</th><th>첫 응답일</th></tr></thead><tbody>${participants||'<tr><td colspan="7" class="empty">아직 완료된 응답이 없습니다.</td></tr>'}</tbody></table></div></div>
  <p class="note">분석 단위는 참가자입니다. 95% 구간은 완료 참가자를 재표집한 2,000회 부트스트랩의 기술적 구간이며, 표본이 2명 미만이면 계산하지 않습니다. 무작위 A/B 배치와 각 훈련의 문항 순서는 참가자별로 독립입니다. 원자료 CSV의 응답 시간·재생 횟수는 브라우저가 보고한 값이므로 실제 청취를 독립 검증한 자료는 아닙니다.</p><p class="muted">인증 계정: ${safeText(email)}</p></section>`;
  $('#refresh').addEventListener('click',renderAdmin);
  $('#signout').addEventListener('click',async()=>{await db.auth.signOut();renderAdmin();});
  $('#export').addEventListener('click',()=>{const cols=['session_id','participant_code','training','pair_id','trial_index','a_path','b_path','ai_side','chosen_side','is_correct','confidence','response_ms','a_plays','b_plays','created_at'];downloadCSV('voice-study-trials.csv',[cols,...all.map(row=>cols.map(col=>row[col]))]);});
  $('#export-summary').addEventListener('click',()=>{const cols=['participant_code','session_id','training1_correct','training2_correct','total_correct','mean_confidence','a_choice_count','first_response_at'];downloadCSV('voice-study-participants.csv',[cols,...complete.map(rows=>[rows[0].participant_code,rows[0].session_id,rows.filter(r=>r.training===1&&r.is_correct).length,rows.filter(r=>r.training===2&&r.is_correct).length,rows.filter(r=>r.is_correct).length,fmt(avg(rows.map(r=>r.confidence))),rows.filter(r=>r.chosen_side==='A').length,rows[0].created_at])]);});
}
window.addEventListener('hashchange',render);
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN'&&adminRoute()){sessionStorage.removeItem('adminIntent');setTimeout(renderAdmin,0);}});
render();

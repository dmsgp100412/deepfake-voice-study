# AI 음성 판별 실험

본실험과 파일럿 훈련 1을 같은 정적 사이트에서 URL로 분리합니다.

- 본실험 훈련 1+2: https://dmsgp100412.github.io/deepfake-voice-study/
- 파일럿 훈련 1: https://dmsgp100412.github.io/deepfake-voice-study/#training1
- 파일럿 훈련 2: https://dmsgp100412.github.io/deepfake-voice-study/#training2
- 본실험 관리자 통계: https://dmsgp100412.github.io/deepfake-voice-study/#admin
- 파일럿 훈련 1 통계: https://dmsgp100412.github.io/deepfake-voice-study/#admin-training1
- 파일럿 훈련 2 통계: https://dmsgp100412.github.io/deepfake-voice-study/#admin-training2

## 실험 페이지 분리

기본 주소 `/`는 본실험용입니다. 훈련 1과 훈련 2를 모두 진행하며, 총 40개 문항을 제출합니다.

`#training1`은 훈련 1 파일럿용이며 20개 문항을 진행합니다.

`#training2`는 훈련 2 파일럿용이며 20개 문항을 진행합니다.

두 실험은 로컬 저장 키와 Supabase 저장 구분값을 다르게 사용합니다.

- 본실험: `experiment_mode = main`
- 파일럿 훈련 1: `experiment_mode = pilot_training1`
- 파일럿 훈련 2: `experiment_mode = pilot_training2`

따라서 훈련 1·2 파일럿 응답은 본실험 관리자 통계나 서로 다른 파일럿 통계에 포함되지 않습니다.

## 수집 항목

- 참여 동의
- 성별: 남성, 여성
- 연령대: 20대, 30대
- 문항별 AI 선택
- 확신도 1점부터 5점
- 마지막 음성 종료 후 첫 AI 선택까지의 반응시간
- A/B 재생 횟수

## 관리자 페이지

`#admin`은 `experiment_mode = main` 응답만 조회합니다. 40개 문항을 모두 제출한 세션만 완료 참가자 통계에 포함합니다.

`#admin-training1`은 `experiment_mode = pilot_training1` 응답만 조회합니다.

`#admin-training2`는 `experiment_mode = pilot_training2` 응답만 조회합니다. 각 파일럿 통계는 해당 훈련의 20개 문항을 모두 제출한 세션만 포함합니다.

관리자 기능:

- 전체 정답률, 평균 확신도, 평균 반응시간
- 정오답별 평균 확신도
- AI 위치별 정답률
- 확신도 분포
- 참가자별 요약
- 개인별 상세 응답
- 문항별 결과
- Excel 다운로드
- 응답 편집/삭제
- 참가자 성별/연령대 수정
- 참가자 전체 응답 삭제

## 보안 메모

정답 매핑은 Supabase의 `stimuli` 테이블과 `submit_trial` RPC에서 서버 측으로 검증합니다. 공개 사이트에는 서비스 역할 키나 DB 비밀번호를 포함하지 않습니다.

## A/B 정답 위치 균형

새 실험 세션의 문항 순서는 Supabase `create_trial_order` RPC가 생성합니다. 각 훈련 20문항에서 AI 정답 위치는 A 10개, B 10개로 구성됩니다. 두 문항씩 묶인 각 블록에는 A 정답과 B 정답이 하나씩 들어가므로 같은 정답 위치가 3문항 이상 연속되지 않습니다. 본실험은 훈련 1과 훈련 2 각각 10:10, 전체 20:20입니다. 정답 파일 매핑은 브라우저에 공개하지 않습니다.

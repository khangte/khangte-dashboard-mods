# khangte-dashboard-mods

Claude Code를 작은 대시보드로 바꿔 주는 플러그인입니다.
입력창 위에는 사용량·퇴근 시간·할 일을 한눈에 보여 주는 띠를, 오른쪽에는 패널 세 개를, 작업 중에는 응원 스피너를 띄웁니다.

- Claude 모델을 따로 부르지 않습니다. 플러그인이 토큰을 쓰지 않습니다.
- 할 일·메모·퇴근 시각은 각자의 컴퓨터에만 저장됩니다.
- ⚡ 빠른 요청 단추는 입력창을 채우기만 하며, 보내기는 직접 Enter로 합니다.

## 설치

마켓플레이스를 먼저 추가한 뒤 플러그인을 설치합니다.

Claude Code
```
/plugin marketplace add khangte/khangte-dashboard-mods
/plugin install khangte-dashboard-mods@my-mods
```

Shell
```
claude plugin marketplace add khangte/khangte-dashboard-mods
claude plugin install khangte-dashboard-mods@my-mods
```

설치 범위를 묻는 화면이 나오면 맨 위의 user를 Enter로 고르면 됩니다.

데스크톱 앱에서는 입력창 옆 **+** → Plugins → Add marketplace에 `khangte/khangte-dashboard-mods`를 넣고 Add plugin을 누릅니다.

명령어(`/todo` 등)는 대화가 시작될 때 등록됩니다. 대화 도중에 처음 설치했다면 새 대화에서 사용하십시오.

### 업데이트

Claude Code
```
/plugin marketplace update my-mods
/plugin update khangte-dashboard-mods@my-mods
```

Shell
```
claude plugin marketplace update my-mods
claude plugin update khangte-dashboard-mods@my-mods
```

> 업데이트 뒤에는 `/reload-plugins`를 입력하거나 새 대화를 열면 반영됩니다.

### 삭제

Claude Code
```
/plugin uninstall khangte-dashboard-mods@my-mods
```

Shell
```
claude plugin uninstall khangte-dashboard-mods@my-mods
```

## 구성

플러그인 하나가 세 부분으로 이루어져 있습니다. 각 부분은 ⚙ 모즈 설정에서 끄고 켤 수 있습니다.

| 부분 | 보이는 곳 | 코드 |
|---|---|---|
| 입력창 위 띠 | 입력창 바로 위 | `hooks/band` |
| 오른쪽 패널 (🎛 Claude 도구 · ⚙ 모즈 설정 · 🗓 오늘 할 일) | 대화 오른쪽 | `hooks/band`, `hooks/tasks` |
| 💬 동기부여 스피너 | Claude가 일하는 동안 | `hooks/spinner` |

### 1. 입력창 위 띠

한 줄씩 쌓이며, 순서는 ⚙ 모즈 설정에서 ▲▼로 바꿀 수 있습니다. 기본 순서는 다음과 같습니다.

| 줄 | 보여 주는 것 |
|---|---|
| ☑ 오늘 할 일 게이지 | 오늘 할 일 중 끝낸 만큼 채워지는 상자 |
| 🏃 퇴근 카운터 | 퇴근까지 남은 시간과 그 길을 걷는 강아지 🐕 (`/workhours`로 시각 설정) |
| ⏱ 사용량 줄 | SESSION(5시간) · WEEK(주간) · CONTEXT 한도 |
| 🖥 컴퓨터 상태 줄 | CPU · RAM · 배터리 (5초마다 읽기만 합니다) |
| 🙈 가림막 | 답변 속 이메일·전화번호를 가려서 표시 (원본은 그대로 유지) |
| ⚡ 빠른 요청 단추 | 🎛 Claude 도구에 적어 둔 요청. 누르면 입력창에 채워짐 |
| 📋 이번 작업 진행 막대 | Claude가 지금 하는 일의 체크리스트 진행률 |

맨 아래 단추 줄에는 **👁 가림막 켜고 끄기 · 🗓 오늘 할 일 · 🎛 Claude 도구 · ⚙ 모즈 설정**이 있습니다.
패널 단추는 다른 패널이 떠 있어도 누른 패널을 앞으로 가져옵니다.

### 2. 오른쪽 패널

**🎛 Claude 도구**

- **📊 사용량**: 컨텍스트 · 5시간 한도 · 주간 한도 고리 (40%부터 노랑, 60% 주황, 80% 빨강)
- **🤖 모델**: Model(Opus / Sonnet)과 Effort(low / mid / high) 단추. 누르면 바로 적용됩니다 (`/model opus`, `/effort low`와 같습니다).
- **⚡ 빠른 요청**: 입력창 위 ⚡ 단추가 될 요청 적기 · ▲ 순서 · ✕ 지우기
- **📝 다음 요청 메모**: Claude가 일하는 동안 다음에 시킬 일을 적어 두고, 끝나면 입력창에 채우기

**🗓 오늘 할 일**

- **인사말**: 이름과 오늘 끝낼 일 개수 (`/todo-name`으로 이름 설정)
- **🍅 집중 타이머**: 25분 집중 · 5분 휴식 포모도로
  - ▶ 시작/⏸ 일시정지 단추 하나, ⏭ 건너뛰기, ↺ 처음으로
  - 집중(분)·휴식(분) 칸: 1~180 사이 숫자를 적고 각 칸의 적용(Enter)을 누르면 그 시간만 바뀝니다.
  - 알림: 집중이 시작되면 🟢, 휴식이 시작되면 🔴, ↺로 멈추면 ⏹. 오른쪽 위 알림 상자로 뜨고, 터미널에서는 운영체제 알림도 보냅니다.
- **☑ 할 일 목록**: 진행 막대, 오늘 · 예정 · 완료 탭, 할 일 카드(○ 완료, ✕ 삭제)

**⚙ 모즈 설정**

- 띠의 줄, 스피너, 두 패널을 하나씩 켜고 끄기
- 띠의 줄 순서를 ▲▼로 바꾸기
- 🎨 색상: 어둡게(기본) · 밝게. 흰 화면에서는 밝게를 고르십시오. 고른 색은 띠와 세 패널에 함께 적용되고, 다음 대화에도 유지됩니다.

### 3. 💬 동기부여 스피너

Claude가 일하는 동안 스피너 자리에 응원 문구와 도구 사용 횟수를 표시합니다. 🍅 타이머가 돌고 있으면 남은 시간도 함께 표시합니다.

## 명령어

| 명령 | 하는 일 |
|---|---|
| `/todo` | 🗓 오늘 할 일 패널 열기 |
| `/todo 견적서 검토 15:00 #급함` | 할 일 추가 (시간과 태그 `#급함` `#업무` `#중요`는 생략 가능) |
| `/todo-name 이름` | 인사말에 나올 이름 설정 |
| `/pomodoro 25 5` | 집중·휴식 시간(분) 변경 |
| `/control` | 🎛 Claude 도구 패널 열기 |
| `/memo` | 🎛 Claude 도구의 📝 다음 요청 메모 열기 |
| `/mods-settings` | ⚙ 모즈 설정 패널 열기 |
| `/workhours 09:00 18:00` | 출근·퇴근 시각 변경 |

## 직접 고쳐 쓰기

```
.claude-plugin/   plugin.json, marketplace.json
hooks/
  register.tsx    세 부분을 함께 불러옴
  band/           입력창 위 띠, 🎛 Claude 도구, ⚙ 모즈 설정
  tasks/          🗓 오늘 할 일, 🍅 집중 타이머
  spinner/        💬 동기부여 스피너
tests/            claude plugin test 로 실행하는 테스트
types/            상태 정의
```

- 테스트는 이 폴더에서 `claude plugin test .`, 검사는 `claude plugin validate .`로 실행합니다.
- 폴더에서 설치한 경우, 파일을 고친 뒤 Claude Code에서 `/reload-plugins`를 입력하면 반영됩니다.

## 요구 사항

Mods(UI 훅 플러그인)를 지원하는 Claude Code가 필요합니다. 터미널과 데스크톱 앱 모두에서 표시됩니다.

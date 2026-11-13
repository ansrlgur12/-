# 출시 서버 배포 (jjw.kihyuk.site)

임대 서버(Ubuntu 22.04)에 게임 서버를 올리는 순서. 서버에는 이미 nginx(80/443)와 PM2가 있다.

- 게임 서버: PM2로 실행, `127.0.0.1:4000` (바깥에서는 nginx를 거쳐서만)
- nginx: `jjw.kihyuk.site` → `127.0.0.1:4000`, HTTPS(Let's Encrypt), WebSocket(socket.io)
- Node: 게임 서버만 Node 24 (nvm). 서버의 기존 Node 20 앱은 그대로
- 지도 타일은 PC에서 만들어 올린다 (만들 때 메모리 6GB 필요)

명령의 `<서버IP>`는 서버 주소, SSH 포트는 `6539`.

---

## 0. 카카오 키 새로 발급 (한 번)

예전 커밋의 `server/.env.example`에 실제 키가 들어가 GitHub에 올라갔다. 지금 파일은 비웠지만 git 기록에는 남아 있다.

1. https://developers.kakao.com → 내 애플리케이션 → 앱 키 → REST API 키 **재발급**
2. PC의 `server/.env`와 서버의 `server/.env`에 새 키를 넣는다

## 1. PC: 코드 올리기

```powershell
cd C:\Dev\project_sng
git add -A
git commit -m "배포 준비"
git push
```

## 2. 서버: Node 24 (게임 서버 전용)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm alias default 20   # 기본 node는 계속 20 (기존 앱용)
nvm which 24           # 경로 확인 (PM2에 넘긴다)
```

> 기존 앱이 nvm이 아닌 시스템 Node 20을 쓰고 있다면 `nvm alias default system`으로 둔다.

## 3. 서버: 코드 받고 의존성 설치

```bash
cd ~
git clone https://github.com/ansrlgur12/-.git jikjwau
cd jikjwau
nvm exec 24 npm ci -w server -w shared --include-workspace-root
```

> 앱(client) 의존성은 서버에 필요 없어서 빼고 설치한다.

## 4. PC → 서버: 지도 타일 올리기 (약 450MB, 파일 15만 개라 묶어서 보낸다)

PC (PowerShell). 폴더 이름은 `server/data/tiles.json`의 `dir`.
root로 바로 SSH가 막혀 있을 수 있어서 `ansrlgur12` 홈으로 올린 뒤 서버에서 옮긴다:

```powershell
cd C:\Dev\project_sng\server\data
tar -cf tiles.tar tiles-20261113-062913 tiles.json
scp -P 6539 tiles.tar ansrlgur12@jjw.kihyuk.site:/home/ansrlgur12/
Remove-Item tiles.tar
```

> DNS가 아직 안 퍼져 접속이 안 되면 `jjw.kihyuk.site` 대신 서버 IP.

서버 (root). `server/data`는 git에 없어서 먼저 만든다:

```bash
mkdir -p /root/jikjwau/server/data
mv /home/ansrlgur12/tiles.tar /root/jikjwau/server/data/
cd /root/jikjwau/server/data
tar -xf tiles.tar && rm tiles.tar
ls   # tiles-20261113-062913  tiles.json
```

> 땅 높이(`data/terrain`)는 올리지 않는다. 서버가 처음 필요할 때 만들고, 아래 8번에서 미리 만들어 둔다.
> 기록 DB(`records.db`)도 서버에서 새로 생긴다.

## 5. 서버: 비밀 값

```bash
cd ~/jikjwau/server
cp .env.example .env
nano .env   # KAKAO_REST_API_KEY=새 키, CONTACT_EMAIL=개인정보처리방침에 보일 문의 이메일
```

## 6. 서버: PM2로 실행

```bash
cd ~/jikjwau
nvm use 20                   # pm2는 Node 20 쪽에 깔려 있다 (nvm install 24 뒤에는 24로 바뀌어 있어서 pm2를 못 찾는다)
NODE24=$(nvm which 24) pm2 start deploy/ecosystem.config.cjs
pm2 save                     # 재부팅해도 다시 켜지게 (pm2 startup을 이미 해 뒀다면)
curl http://127.0.0.1:4000/health   # {"ok":true}
pm2 logs jikjwau --lines 20
```

## 7. 서버: nginx + HTTPS

```bash
sudo cp ~/jikjwau/deploy/nginx-jjw.kihyuk.site.conf /etc/nginx/sites-available/jjw.kihyuk.site
sudo ln -s /etc/nginx/sites-available/jjw.kihyuk.site /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jjw.kihyuk.site        # certbot이 없으면: sudo apt install certbot python3-certbot-nginx
curl https://jjw.kihyuk.site/health            # {"ok":true}
# 개인정보처리방침: https://jjw.kihyuk.site/privacy (App Store에 이 주소를 적는다)
```

## 8. 서버: 전국 땅 높이 미리 만들기 (백그라운드, 오래 걸림)

처음 가 보는 동네도 지도가 빨리 뜨게. 끊겨도 다시 돌리면 이어서 만든다.

```bash
cd ~/jikjwau
# nvm은 셸 함수라 nohup에 바로 못 넘긴다: Node 24 경로를 PATH 앞에 둔다
PATH="$(dirname "$(nvm which 24)"):$PATH" nohup npm run terrain:prebuild -w server -- --jobs 2 > ~/terrain.log 2>&1 &
tail -f ~/terrain.log
```

## 9. 앱이 이 서버를 보게

앱은 서버 주소를 이렇게 정한다 (`client/src/api/http.ts`):

- `EXPO_PUBLIC_API_URL`이 있으면 그 주소
- 없으면 Expo를 켠 PC의 IP + 4000 (개발 중에 PC에서 돌리는 서버, 같은 와이파이)

그래서 출시 서버로 바꾸려면 이 값만 정하면 된다.

### 9-1. 먼저 서버가 바깥에서 되는지 확인

휴대폰 사파리로 `https://jjw.kihyuk.site/health` 를 연다. `{"ok":true}`가 보이면 된다.
(안 보이면 7번 nginx·HTTPS를 다시 확인. 앱에서 확인하는 것보다 원인을 찾기 쉽다)

### 9-2. 개발 중 (Expo Go로 출시 서버에 붙여 보기)

1. `C:\Dev\project_sng\client\.env` 파일을 만든다 (없으면 새로, git에는 안 올라간다):

   ```
   EXPO_PUBLIC_API_URL=https://jjw.kihyuk.site
   ```

   - 끝에 `/`를 붙이지 않는다 (`/map/...`처럼 앱이 뒤에 붙인다)
   - `http`가 아니라 `https`
2. 켜져 있는 Expo를 끄고(Ctrl+C) 캐시를 지우며 다시 켠다. `EXPO_PUBLIC_` 값은 번들에 박히므로 다시 켜야 바뀐다:

   ```powershell
   cd C:\Dev\project_sng\client
   npx expo start -c
   ```
3. 아이폰 Expo Go에서 다시 연다. 이제 PC 서버(`npm run dev:server`)를 꺼도 게임이 된다.
4. 잘 붙었는지: 메인 화면에 "서버에 연결하는 중…"이 안 뜨고, 장소 검색·혼자 하기가 되면 된다.

### 9-3. 다시 PC 서버로 돌아가기

`client/.env`에서 그 줄을 지우거나 앞에 `#`을 붙이고, 다시 `npx expo start -c`.
(서버 코드를 고치며 시험할 때는 PC 서버가 편하다)

### 9-4. 출시용 빌드(EAS)

스토어에 올릴 앱은 Expo Go가 아니라 EAS로 만든다. 그때도 같은 값을 쓴다:
`client/eas.json`의 빌드 프로필 `env`에 `"EXPO_PUBLIC_API_URL": "https://jjw.kihyuk.site"` (출시 빌드를 만들 때 함께 정리).

---

## 업데이트할 때

코드:

```bash
cd ~/jikjwau && git pull
nvm exec 24 npm ci -w server -w shared --include-workspace-root
pm2 restart jikjwau
```

지도 타일을 다시 만들었으면 4번처럼 새 폴더와 `tiles.json`을 올리고 `pm2 restart jikjwau`. 옛 타일 폴더는 지워도 된다.

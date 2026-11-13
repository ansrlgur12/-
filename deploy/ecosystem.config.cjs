/**
 * PM2 설정: 출시 서버에서 게임 서버를 띄운다 (자세한 순서는 deploy/DEPLOY.md).
 *
 *   NODE24=$(nvm which 24) pm2 start deploy/ecosystem.config.cjs
 *
 * 기존 앱이 쓰는 Node 20은 그대로 두고, 이 서버만 Node 24로 돌린다 (기록 DB가 node:sqlite를 쓴다).
 */
module.exports = {
  apps: [
    {
      name: 'jikjwau',
      cwd: `${__dirname}/../server`,
      script: 'src/app.ts',
      interpreter: process.env.NODE24 || 'node',
      interpreter_args: '--env-file-if-exists=.env --import tsx',
      env: {
        NODE_ENV: 'production',
        // 바깥에서는 nginx(HTTPS)를 거쳐서만 들어온다
        HOST: '127.0.0.1',
        PORT: '4000',
      },
      // 같은 서버에 다른 서비스도 있어서 메모리를 넘기면 다시 띄운다
      max_memory_restart: '1G',
      autorestart: true,
      time: true,
    },
  ],
}

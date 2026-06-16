module.exports = {
  apps: [{
    name: 'furry-hotel',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    watch: false,
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
  }],
};

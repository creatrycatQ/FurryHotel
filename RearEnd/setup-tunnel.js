const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync, spawn } = require('child_process');

const rootDir = path.join(__dirname, '..');
const cloudflaredExe = path.join(rootDir, 'cloudflared.exe');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('===================================================');
    console.log('       FurryHotel - Cloudflare 隧道重新搭建工具');
    console.log('===================================================\n');
    console.log('请选择搭建 Cloudflare 隧道的方案：\n');
    console.log('  [1] 方案 A：使用 Cloudflare Zero Trust Dashboard Token (推荐)');
    console.log('  [2] 方案 B：使用命令行交互登录重新授权');
    console.log('  [3] 测试当前隧道连接状态');
    console.log('  [4] 退出\n');
    
    const choice = (await question('请输入选项数字 (1-4): ')).trim();
    
    if (choice === '1') {
        await methodToken();
    } else if (choice === '2') {
        await methodCLI();
    } else if (choice === '3') {
        await testTunnel();
    } else {
        console.log('已退出。');
        rl.close();
    }
}

async function methodToken() {
    console.log('\n===================================================');
    console.log('  方案 A：使用 Cloudflare Zero Trust Dashboard Token');
    console.log('===================================================\n');
    console.log('步骤说明：');
    console.log(' 1. 登录 https://one.dash.cloudflare.com/');
    console.log(' 2. 进入 Networks -> Tunnels，点击 Add a tunnel');
    console.log(' 3. 命名隧道（例如 furry-hotel）并保存');
    console.log(' 4. 复制生成的运行命令中的 Token (格式如 eyJh...)');
    console.log(' 5. 在 Public Hostname 中配置：');
    console.log('    - Subdomain/Domain: 你的域名（如 event.creatrycat.cn）');
    console.log('    - Service: HTTP localhost:3000\n');
    
    const token = (await question('请输入复制好的 Cloudflare Tunnel Token: ')).trim();
    if (!token) {
        console.log('[错误] Token 不能为空！');
        rl.close();
        return;
    }
    
    const tokenFile = path.join(rootDir, 'tunnel_token.txt');
    fs.writeFileSync(tokenFile, token, 'utf8');
    console.log('\n[成功] Token 已保存至 tunnel_token.txt ！');
    console.log('后续运行 RearEnd\\启动.bat 时将自动使用该 Token 启动隧道。\n');
    
    const testNow = (await question('是否现在测试启动隧道？(Y/N): ')).trim().toUpperCase();
    if (testNow === 'Y') {
        runTunnelToken(token);
    } else {
        rl.close();
    }
}

async function methodCLI() {
    console.log('\n===================================================');
    console.log('  方案 B：使用命令行交互登录重新授权');
    console.log('===================================================\n');
    console.log('[Step 1] 正在启动浏览器授权，请在打开的网页中选择你的域名进行授权...\n');
    
    const loginRes = spawnSync(cloudflaredExe, ['login'], { stdio: 'inherit', cwd: rootDir });
    if (loginRes.status !== 0) {
        console.log('\n[错误] 授权未完成或出现异常。');
        rl.close();
        return;
    }
    
    console.log('\n[Step 2] 请输入新的 Tunnel 名称（默认: furryhotel-tunnel）:');
    let tunnelName = (await question('名称 (直接回车使用默认): ')).trim();
    if (!tunnelName) tunnelName = 'furryhotel-tunnel';
    
    console.log(`\n正在创建 Tunnel ${tunnelName}...`);
    spawnSync(cloudflaredExe, ['tunnel', 'create', tunnelName], { stdio: 'inherit', cwd: rootDir });
    
    // 自动寻找并复制生成的 .json 凭证文件
    const credFileName = findAndCopyCredentials(tunnelName);

    console.log('\n[Step 3] 请输入绑定的完整域名（例如: event.creatrycat.cn）:');
    const domainName = (await question('域名: ')).trim();
    if (!domainName) {
        console.log('[错误] 域名不能为空！');
        rl.close();
        return;
    }
    
    console.log(`\n正在绑定域名 DNS 路由 (${domainName} -> ${tunnelName})...`);
    spawnSync(cloudflaredExe, ['tunnel', 'route', 'dns', tunnelName, domainName], { stdio: 'inherit', cwd: rootDir });
    
    console.log('\n[Step 4] 正在更新 config.yml...');
    const configYml = `tunnel: ${tunnelName}
credentials-file: ${credFileName}

ingress:
  - hostname: ${domainName}
    service: http://localhost:3000
  - service: http_status:404
`;
    fs.writeFileSync(path.join(rootDir, 'config.yml'), configYml, 'utf8');
    
    const tokenFile = path.join(rootDir, 'tunnel_token.txt');
    if (fs.existsSync(tokenFile)) {
        fs.unlinkSync(tokenFile);
    }
    
    console.log('\n[成功] 隧道已重新搭建完成并更新 config.yml！\n');
    const testNow = (await question('是否现在测试启动隧道？(Y/N): ')).trim().toUpperCase();
    if (testNow === 'Y') {
        runTunnelConfig();
    } else {
        rl.close();
    }
}

async function testTunnel() {
    console.log('\n===================================================');
    console.log('             测试当前 Cloudflare 隧道连接');
    console.log('===================================================\n');
    const tokenFile = path.join(rootDir, 'tunnel_token.txt');
    const configFile = path.join(rootDir, 'config.yml');
    
    if (fs.existsSync(tokenFile)) {
        const token = fs.readFileSync(tokenFile, 'utf8').trim();
        console.log('检测到 tunnel_token.txt，正在尝试使用 Token 运行隧道...');
        runTunnelToken(token);
    } else if (fs.existsSync(configFile)) {
        console.log('检测到 config.yml，正在尝试使用配置文件运行隧道...');
        runTunnelConfig();
    } else {
        console.log('[错误] 未找到 tunnel_token.txt 或 config.yml，请先进行搭建！');
        rl.close();
    }
}

function runTunnelToken(token) {
    rl.close();
    console.log('正在启动隧道测试... 按 Ctrl+C 可停止测试\n');
    spawn(cloudflaredExe, ['tunnel', 'run', '--token', token], { stdio: 'inherit', cwd: rootDir });
}

function runTunnelConfig() {
    rl.close();
    console.log('正在启动隧道测试... 按 Ctrl+C 可停止测试\n');
    spawn(cloudflaredExe, ['tunnel', '--config', 'config.yml', 'run'], { stdio: 'inherit', cwd: rootDir });
}

function findAndCopyCredentials(tunnelName) {
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    const cloudflaredDir = path.join(userHome, '.cloudflared');

    if (fs.existsSync(cloudflaredDir)) {
        const files = fs.readdirSync(cloudflaredDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        if (jsonFiles.length > 0) {
            let newestFile = null;
            let newestMtime = 0;
            for (const file of jsonFiles) {
                const fullPath = path.join(cloudflaredDir, file);
                const stat = fs.statSync(fullPath);
                if (stat.mtimeMs > newestMtime) {
                    newestMtime = stat.mtimeMs;
                    newestFile = fullPath;
                }
            }
            if (newestFile) {
                const targetPath = path.join(rootDir, `${tunnelName}.json`);
                fs.copyFileSync(newestFile, targetPath);
                fs.copyFileSync(newestFile, path.join(rootDir, 'mytunnel.json'));
                console.log(`[信息] 已自动识别并复制凭证文件至 ${tunnelName}.json`);
                return `${tunnelName}.json`;
            }
        }
    }

    if (fs.existsSync(path.join(rootDir, `${tunnelName}.json`))) {
        return `${tunnelName}.json`;
    }
    if (fs.existsSync(path.join(rootDir, 'mytunnel.json'))) {
        return 'mytunnel.json';
    }

    return `${tunnelName}.json`;
}

main();


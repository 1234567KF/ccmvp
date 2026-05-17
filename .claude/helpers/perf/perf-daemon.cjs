#!/usr/bin/env node
/**
 * perf-daemon.cjs — Perf Dashboard 后台守护进程（无窗口）
 *
 * 用法:
 *   node perf-daemon.cjs start   启动后台服务（无窗口）
 *   node perf-daemon.cjs stop    停止后台服务
 *   node perf-daemon.cjs restart 重启
 *   node perf-daemon.cjs status  查询状态
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_SCRIPT = path.join(__dirname, 'perf-server.cjs');
const PID_FILE = path.join(__dirname, '.perf-server.pid');
const PORT = process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3456';

function readPid() {
  try { return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10); } catch { return null; }
}

function writePid(pid) {
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch { return false; }
}

function cmdStart() {
  const existingPid = readPid();
  if (existingPid && isRunning(existingPid)) {
    console.log('[perf-daemon] already running (pid ' + existingPid + ')');
    return;
  }

  // spawn detached, hidden, no console window
  const child = spawn('node', [SERVER_SCRIPT, '--port', PORT], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,  // ←关键：无窗口
  });

  child.unref(); // 允许父进程独立退出
  writePid(child.pid);
  console.log('[perf-daemon] started (pid ' + child.pid + ') on port ' + PORT);
}

function cmdStop() {
  const pid = readPid();
  if (!pid) {
    console.log('[perf-daemon] not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    // Also kill any process on the port
    require('child_process').execSync('taskkill //F //PID ' + pid + ' 2>nul', { stdio: 'ignore' });
  } catch {}

  try { fs.unlinkSync(PID_FILE); } catch {}
  console.log('[perf-daemon] stopped (pid ' + pid + ')');
}

function cmdStatus() {
  const pid = readPid();
  if (pid && isRunning(pid)) {
    console.log('[perf-daemon] running (pid ' + pid + ') → http://localhost:' + PORT);
  } else {
    console.log('[perf-daemon] not running');
  }
}

const cmd = process.argv[2] || 'status';
switch (cmd) {
  case 'start':  cmdStart();  break;
  case 'stop':   cmdStop();   break;
  case 'restart': cmdStop(); setTimeout(cmdStart, 500); break;
  default:       cmdStatus(); break;
}

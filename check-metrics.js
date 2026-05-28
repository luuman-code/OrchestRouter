const data = JSON.parse(require('fs').readFileSync('C:/Users/LWB/OrchestRouter/test-metrics.json', 'utf8'));
const tasks = data.data.today.tasks;

console.log('=== 所有任务 ===');
tasks.forEach((t, i) => {
  console.log((i+1) + '. taskId: ' + t.taskId + ' | sessionId: ' + t.sessionId + ' | time: ' + t.executionTime + 'ms');
});

// 按 sessionId 分组
const sessions = {};
tasks.forEach(t => {
  const sid = t.sessionId || 'null';
  if (!sessions[sid]) {
    sessions[sid] = [];
  }
  sessions[sid].push(t);
});

console.log('\n=== 按 sessionId 分组 ===');
Object.keys(sessions).forEach(sid => {
  const s = sessions[sid];
  console.log('\nSession: ' + sid);
  console.log('  任务数: ' + s.length);
  s.forEach(t => {
    console.log('    - ' + t.taskId + ' | time: ' + t.executionTime + 'ms');
  });
});

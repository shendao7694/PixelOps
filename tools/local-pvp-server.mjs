// Development-only entry point used by start-local-pvp.bat. Environment
// switches are installed before serve.mjs imports authentication/server code,
// so the public `npm start` path can never accidentally inherit the bypass.
if (process.env.NODE_ENV === 'production') {
  throw new Error('The local PVP authentication bypass cannot run in production.');
}

process.env.NODE_ENV = 'development';
process.env.PVP_TEST_AUTH_BYPASS = '1';
process.env.PVP_DISABLE_BAN_PERSISTENCE = '1';
// Guest/dev mode turns hit-registration tracing on by default so swallowed-shot
// debugging needs zero setup. Override with PVP_SHOT_DEBUG=0 to silence it.
// process.env.PVP_SHOT_DEBUG ||= '1';
// Anti-cheat metric tracing: one JSON line per firing input tick (aim offset +
// ln(offset) + snap + lock state) for threshold tuning against cheat samples.
// process.env.PVP_ANTICHEAT_DEBUG ||= '1';
// Spawn an indestructible, circling enemy per room so a lone developer can test
// the moving-target lock rule without a second client. PVP_TEST_DUMMY=0 disables.
// process.env.PVP_TEST_DUMMY ||= '1';
process.env.HOST ||= '127.0.0.1';
process.env.PORT ||= '18123';
global.istest = true;

console.log('');
console.log('  Guest Player Mode');
console.log('');

await import('../serve.mjs');

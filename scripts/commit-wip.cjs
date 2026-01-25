#!/usr/bin/env node
const { spawnSync } = require('child_process');

let args = process.argv.slice(2);
// drop a single leading -- if present (npm passes through args that way)
if (args.length && args[0] === '--') args = args.slice(1);
if (!args.length) {
  console.log('Usage: npm run commit:skip-color -- -- <git-commit-args>');
  console.log('Example: npm run commit:skip-color -- -- -m "WIP: temp commit"');
  process.exit(0);
}

const gitArgs = args;
// If user passed flags (e.g. -m "msg") without the 'commit' subcommand,
// assume they want `git commit` and prepend it.
if (gitArgs.length && gitArgs[0].startsWith('-')) {
  gitArgs.unshift('commit');
}

const result = spawnSync('git', gitArgs, {
  stdio: 'inherit',
  env: Object.assign({}, process.env, { SKIP_COLOR_CHECK: '1' }),
});

process.exit(result.status);

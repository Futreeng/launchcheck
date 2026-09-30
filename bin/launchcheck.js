#!/usr/bin/env node
"use strict";

require("../src/cli")
  .main(process.argv.slice(2))
  .catch((e) => {
    process.stderr.write(`launchcheck error: ${e.stack || e.message}\n`);
    process.exitCode = 1;
  });

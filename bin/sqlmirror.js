#!/usr/bin/env node
import { sqlMirrorCli } from "../lib/index.js";

sqlMirrorCli().catch(console.error);

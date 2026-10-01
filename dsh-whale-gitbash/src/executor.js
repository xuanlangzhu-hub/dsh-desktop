import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox';
import z from '@deepseek-ai/schemastery';
import { createGitBashExecutor } from './executor-core.js';

export default createGitBashExecutor(SandboxPwshExecutor, z);

  import * as sandcastle from "@ai-hero/sandcastle";

  /**
   * The Claude Code agent every run script uses. Runs are unattended, so a
   * permission prompt can never be answered: without a sandcastle sandbox,
   * sandcastle leaves Claude Code in its default mode, which stalls every write
   * and Bash command. The runner policy's deny rules and sandbox still apply.
   */
  export const agent = (model: string) => sandcastle.claudeCode(model, { permissionMode: "bypassPermissions" });

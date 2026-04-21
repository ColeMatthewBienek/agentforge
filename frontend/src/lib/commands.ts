export interface SlashCommand {
  name: string;
  description: string;
  args?: string;       // display hint e.g. "<path>"
  clientOnly: boolean; // true = no round-trip needed
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "clear",
    description: "Clear the conversation",
    clientOnly: true,
  },
  {
    name: "new",
    description: "Start a new session (alias for /clear)",
    clientOnly: true,
  },
  {
    name: "help",
    description: "Show available slash commands",
    clientOnly: true,
  },
  {
    name: "cwd",
    description: "Set the agent working directory",
    args: "<path>",
    clientOnly: false,
  },
  {
    name: "btw",
    description: "Inject context the agent sees but won't reply to",
    args: "<note>",
    clientOnly: true,
  },
];

/** Parse raw input like "/cwd /home/user/project" → { name, args } */
export function parseSlashCommand(input: string): { name: string; args: string } | null {
  if (!input.startsWith("/")) return null;
  const [rawName, ...rest] = input.slice(1).split(" ");
  return { name: rawName.toLowerCase(), args: rest.join(" ").trim() };
}

/** Filter commands by prefix typed after "/" */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

import { parseArgs } from "node:util";
import { invalidArgument } from "./cli-errors.ts";
import type { PutOutputMode } from "./put-output.ts";

type FlagDefinition = {
  name: string;
  type: "boolean" | "string" | "owner/name" | "positive-integer";
  description: string;
  exclusiveGroup?: string;
};

type PositionalDefinition = {
  name: string;
  type: "file" | "object-ref";
  required: true;
};

type CommandDefinition = {
  name: CommandName;
  summary: string;
  positionals: PositionalDefinition[];
  flags: FlagDefinition[];
};

const outputFlags: FlagDefinition[] = [
  {
    name: "json",
    type: "boolean",
    description: "Print structured JSON",
    exclusiveGroup: "output",
  },
  {
    name: "markdown",
    type: "boolean",
    description: "Print Markdown using the raw object URL",
    exclusiveGroup: "output",
  },
  {
    name: "url",
    type: "boolean",
    description: "Print the raw object URL",
    exclusiveGroup: "output",
  },
];

const jsonFlag: FlagDefinition = {
  name: "json",
  type: "boolean",
  description: "Print structured JSON",
};

const dryRunFlag: FlagDefinition = {
  name: "dry-run",
  type: "boolean",
  description: "Validate locally without credentials or a network request",
};

export const commandDefinitions = [
  {
    name: "login",
    summary: "Authenticate through the Attach GitHub App device flow",
    positionals: [],
    flags: [jsonFlag],
  },
  {
    name: "put",
    summary: "Upload a file and return its public URL",
    positionals: [{ name: "file", type: "file", required: true }],
    flags: [
      { name: "repo", type: "owner/name", description: "GitHub repository" },
      { name: "pr", type: "positive-integer", description: "GitHub pull request number" },
      dryRunFlag,
      ...outputFlags,
    ],
  },
  {
    name: "delete",
    summary: "Delete an owned object",
    positionals: [{ name: "url-or-key", type: "object-ref", required: true }],
    flags: [dryRunFlag, jsonFlag],
  },
  {
    name: "logout",
    summary: "Remove locally stored Attach credentials",
    positionals: [],
    flags: [jsonFlag],
  },
  {
    name: "help",
    summary: "Show human or machine-readable command help",
    positionals: [],
    flags: [jsonFlag],
  },
] as const satisfies readonly CommandDefinition[];

const environment = [
  {
    name: "ATTACH_API_BASE",
    required_for: [] as CommandName[],
    description: "Attach API origin; defaults to https://attach.uinaf.dev",
  },
  {
    name: "ATTACH_GITHUB_CLIENT_ID",
    required_for: [] as CommandName[],
    description: "GitHub App client id override; required only for custom Attach deployments",
  },
];

export type CommandName = "login" | "put" | "delete" | "logout" | "help";

export type ParsedCommand =
  | { name: "login"; json: boolean }
  | {
      name: "put";
      file: string;
      repo?: string;
      pr?: number;
      dryRun: boolean;
      output: PutOutputMode;
    }
  | { name: "delete"; ref: string; dryRun: boolean; json: boolean }
  | { name: "logout"; json: boolean }
  | { name: "help"; json: boolean };

function syntax(definition: CommandDefinition): string {
  const positionals = definition.positionals.map((item) => `<${item.name}>`).join(" ");
  const regularFlags = definition.flags.filter((flag) => !flag.exclusiveGroup);
  const groupedFlags = new Map<string, FlagDefinition[]>();
  for (const flag of definition.flags) {
    if (!flag.exclusiveGroup) continue;
    const group = groupedFlags.get(flag.exclusiveGroup) ?? [];
    group.push(flag);
    groupedFlags.set(flag.exclusiveGroup, group);
  }
  const flagSyntax = [
    ...regularFlags.map((flag) =>
      flag.type === "boolean" ? `[--${flag.name}]` : `[--${flag.name} <${flag.type}>]`,
    ),
    ...Array.from(
      groupedFlags.values(),
      (flags) => `[${flags.map((flag) => `--${flag.name}`).join("|")}]`,
    ),
  ];
  const flags = flagSyntax.length > 0 ? ` ${flagSyntax.join(" ")}` : "";
  return `attach ${definition.name}${positionals ? ` ${positionals}` : ""}${flags}`;
}

export function formatHumanHelp(): string {
  const usage = commandDefinitions.map((definition) => `  ${syntax(definition)}`).join("\n");
  return `Usage:\n${usage}\n\nPut output:\n  default      preview URL\n  --url        raw object URL\n  --markdown   Markdown using raw /o URL\n  --json       structured API response\n\nEnvironment:\n  ATTACH_API_BASE            default https://attach.uinaf.dev\n  ATTACH_GITHUB_CLIENT_ID    optional GitHub App client id override for custom deployments\n\nAlso installable as a gh extension (gh attach ...). Does not touch gh auth.`;
}

export function describeCli() {
  return {
    schema_version: 1,
    name: "attach",
    aliases: ["gh attach"],
    commands: commandDefinitions,
    environment,
  };
}

export function wantsJson(argv: string[]): boolean {
  const separator = argv.indexOf("--");
  return argv.slice(0, separator === -1 ? undefined : separator).includes("--json");
}

function definitionFor(name: string): CommandDefinition | undefined {
  return commandDefinitions.find((definition) => definition.name === name);
}

function parseValues(definition: CommandDefinition, args: string[]) {
  const options: Record<string, { type: "boolean" | "string" }> = {};
  for (const flag of definition.flags) {
    options[flag.name] = { type: flag.type === "boolean" ? "boolean" : "string" };
  }

  try {
    return parseArgs({ args, options, strict: true, allowPositionals: true });
  } catch (error) {
    throw invalidArgument(error instanceof Error ? error.message : String(error));
  }
}

function requireArity(command: CommandName, positionals: string[], expected: number): void {
  if (positionals.length !== expected) {
    throw invalidArgument(
      `${command} expects ${expected} positional argument${expected === 1 ? "" : "s"}; received ${positionals.length}`,
    );
  }
}

function parseRepo(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalidArgument("--repo requires owner/name");
  const [owner, repo, extra] = value.split("/");
  const validOwner = /^(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner ?? "");
  const validRepo = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/.test(repo ?? "");
  if (!validOwner || !validRepo || extra !== undefined) {
    throw invalidArgument("--repo must be a valid GitHub owner/name");
  }
  return value;
}

function parsePr(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw invalidArgument("--pr must be a positive integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidArgument("--pr must be a positive safe integer");
  return parsed;
}

function outputMode(values: Record<string, unknown>): PutOutputMode {
  const selected = (["json", "markdown", "url"] as const).filter((name) => values[name] === true);
  if (selected.length > 1) {
    throw invalidArgument("--json, --markdown, and --url are mutually exclusive");
  }
  return selected[0] ?? "preview";
}

export function parseCliArgs(argv: string[]): ParsedCommand {
  const args = [...argv];
  if (args[0] === "attach") args.shift();

  const rawName = args.shift();
  const name = rawName === "--help" || rawName === "-h" ? "help" : rawName;
  if (!name) throw invalidArgument("a command is required");
  const definition = definitionFor(name);
  if (!definition) throw invalidArgument(`unknown command: ${name}`);

  const { values, positionals } = parseValues(definition, args);
  switch (definition.name) {
    case "login":
      requireArity("login", positionals, 0);
      return { name: "login", json: values.json === true };
    case "put":
      requireArity("put", positionals, 1);
      return {
        name: "put",
        file: positionals[0]!,
        repo: parseRepo(values.repo),
        pr: parsePr(values.pr),
        dryRun: values["dry-run"] === true,
        output: outputMode(values),
      };
    case "delete":
      requireArity("delete", positionals, 1);
      return {
        name: "delete",
        ref: positionals[0]!,
        dryRun: values["dry-run"] === true,
        json: values.json === true,
      };
    case "logout":
      requireArity("logout", positionals, 0);
      return { name: "logout", json: values.json === true };
    case "help":
      requireArity("help", positionals, 0);
      return { name: "help", json: values.json === true };
  }
}

import { cn } from "@/lib/utils";
import { type SlashCommand } from "@/lib/commands";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
}

export function SlashCommandMenu({ commands, activeIndex, onSelect }: SlashCommandMenuProps) {
  if (commands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-4 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
      <div className="px-3 py-1.5 border-b border-border">
        <span className="text-xs text-muted-foreground">Commands</span>
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {commands.map((cmd, i) => (
          <li key={cmd.name}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur
                onSelect(cmd);
              }}
              className={cn(
                "w-full flex items-baseline gap-3 px-3 py-2 text-left text-sm transition-colors",
                i === activeIndex
                  ? "bg-accent/20 text-foreground"
                  : "text-foreground hover:bg-secondary"
              )}
            >
              <span className="font-mono text-accent shrink-0">
                /{cmd.name}
                {cmd.args && (
                  <span className="text-muted-foreground font-normal"> {cmd.args}</span>
                )}
              </span>
              <span className="text-muted-foreground text-xs truncate">{cmd.description}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="px-3 py-1.5 border-t border-border">
        <span className="text-xs text-muted-foreground">
          ↑↓ navigate · Tab/Enter select · Esc dismiss
        </span>
      </div>
    </div>
  );
}

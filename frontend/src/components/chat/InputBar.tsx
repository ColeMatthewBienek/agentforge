import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { filterCommands, parseSlashCommand, type SlashCommand } from "@/lib/commands";
import { SlashCommandMenu } from "./SlashCommandMenu";

interface InputBarProps {
  onSend: (prompt: string) => void;
  onCommand: (name: string, args: string) => void;
  onInterrupt: () => void;
  disabled: boolean;
  isDebugMode: boolean;
}

export function InputBar({ onSend, onCommand, onInterrupt, disabled, isDebugMode }: InputBarProps) {
  const [value, setValue] = useState("");
  const [menuCommands, setMenuCommands] = useState<SlashCommand[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const closeMenu = useCallback(() => {
    setMenuCommands([]);
    setActiveIndex(0);
  }, []);

  const handleChange = (newValue: string) => {
    setValue(newValue);
    if (newValue.startsWith("/") && !newValue.includes(" ")) {
      const query = newValue.slice(1);
      const matches = filterCommands(query);
      setMenuCommands(matches);
      setActiveIndex(0);
    } else {
      closeMenu();
    }
  };

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      if (cmd.args) {
        setValue(`/${cmd.name} `);
        closeMenu();
        textareaRef.current?.focus();
      } else {
        onCommand(cmd.name, "");
        setValue("");
        closeMenu();
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
    },
    [onCommand, closeMenu]
  );

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    const parsed = parseSlashCommand(trimmed);
    if (parsed) {
      onCommand(parsed.name, parsed.args);
    } else {
      onSend(trimmed);
    }
    setValue("");
    closeMenu();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % menuCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + menuCommands.length) % menuCommands.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(menuCommands[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="px-4 py-3 border-t border-border bg-background">
      <div className="relative">
        {menuCommands.length > 0 && (
          <SlashCommandMenu
            commands={menuCommands}
            activeIndex={activeIndex}
            onSelect={selectCommand}
          />
        )}
        <div className="flex gap-2 items-end bg-secondary border border-border rounded-lg px-3 py-2 focus-within:border-ring transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? "Agent is responding..." : "Message Claude (/ for commands)"}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 bg-transparent text-foreground text-sm resize-none outline-none placeholder:text-muted-foreground font-mono",
              "min-h-[1.5rem] max-h-[200px]",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          />
          {isDebugMode && (
            <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 select-none">
              DEBUG
            </span>
          )}
          {disabled ? (
            <button
              onClick={onInterrupt}
              className="flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!value.trim()}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                !value.trim() && "opacity-40 cursor-not-allowed"
              )}
            >
              Send
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 ml-1">
          Shift+Enter for newline · / for commands
        </p>
      </div>
    </div>
  );
}

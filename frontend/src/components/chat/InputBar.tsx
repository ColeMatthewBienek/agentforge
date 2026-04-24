import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { filterCommands, parseSlashCommand, type SlashCommand } from "@/lib/commands";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { useAgentStore } from "@/store/agentStore";

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

interface InputBarProps {
  onSend: (prompt: string) => void;
  onCommand: (name: string, args: string) => void;
  onInterrupt: () => void;
  disabled: boolean;
  isDebugMode: boolean;
}

export function InputBar({ onSend, onCommand, onInterrupt, disabled, isDebugMode }: InputBarProps) {
  const value = useAgentStore((s) => s.draftInput);
  const setValue = useAgentStore((s) => s.setDraftInput);
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

  const selectedAgent = useAgentStore((s) => s.selectedAgent);

  return (
    <div className="px-4 py-3 pb-4 border-t border-[#21262d] flex-shrink-0">
      <div className="relative">
        {menuCommands.length > 0 && (
          <SlashCommandMenu
            commands={menuCommands}
            activeIndex={activeIndex}
            onSelect={selectCommand}
          />
        )}
        <div className="rounded-[10px] border border-border bg-card flex items-end px-3.5 py-1 pr-1 focus-within:border-[#484f58] transition-colors">
          <span className="text-[#484f58] mb-2.5 flex-shrink-0">
            <PlusIcon size={16} />
          </span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? "Agent is responding..." : `Message ${selectedAgent}, or /command...`}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 bg-transparent text-[13px] text-foreground placeholder:text-[#484f58] resize-none outline-none py-2 px-2.5",
              "min-h-[20px] max-h-40",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          />
          <div className="flex gap-1 items-center mb-1 mr-0.5">
            {isDebugMode && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 select-none">
                DEBUG
              </span>
            )}
            <span className="text-[10px] text-[#484f58] px-1.5 py-0.5 rounded border border-[#21262d] font-mono select-none">⌘K</span>
            {disabled ? (
              <button
                onClick={onInterrupt}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!value.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-[12px] font-medium cursor-pointer disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

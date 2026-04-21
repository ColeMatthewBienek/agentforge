"""
Tests for ClaudeAgent.
Written before implementation (TDD).
"""
import re
import pytest
from pathlib import Path

from backend.agents.claude_agent import ClaudeAgent, CLAUDE_PROMPT_RE


@pytest.fixture
def agent(tmp_path: Path) -> ClaudeAgent:
    return ClaudeAgent(slot_id=0, workdir=tmp_path)


def test_name_includes_slot_id(agent: ClaudeAgent):
    assert agent.name == "claude-0"


def test_name_slot_1():
    a = ClaudeAgent(slot_id=1, workdir=Path("/tmp"))
    assert a.name == "claude-1"


def test_cmd_is_claude(agent: ClaudeAgent):
    assert agent.cmd[0] == "claude"
    assert "--output-format" in agent.cmd
    assert "stream-json" in agent.cmd
    assert "--print" in agent.cmd


def test_prompt_pattern_is_set(agent: ClaudeAgent):
    assert agent.prompt_pattern is CLAUDE_PROMPT_RE


def test_prompt_pattern_matches_bare_arrow():
    assert CLAUDE_PROMPT_RE.search("> ")


def test_prompt_pattern_matches_arrow_at_end_of_line():
    text = "some response text\n> "
    assert CLAUDE_PROMPT_RE.search(text)


def test_prompt_pattern_matches_after_newline():
    text = "hello world\r\n> "
    assert CLAUDE_PROMPT_RE.search(text)


def test_prompt_pattern_does_not_match_mid_text():
    text = "the answer is > 42 because"
    # Mid-line arrow with text after should not match our "ready" pattern
    assert not CLAUDE_PROMPT_RE.search(text)


def test_initial_status_is_stopped(agent: ClaudeAgent):
    assert agent.status == "stopped"

"""
MCP (Model Context Protocol) package — exposes FinAdvisor tools to
external AI clients via the standard MCP protocol.

Enables:
    - Claude Desktop: connect via claude_desktop_config.json
    - VS Code Copilot: connect via mcp config
    - Any MCP-compatible agent or tool host

Running the server:
    cd backend
    python -m src.mcp.server

The server communicates over stdio (stdin/stdout) using JSON-RPC 2.0.
No HTTP port is required — the MCP client launches it as a subprocess.

Claude Desktop config (~/.config/claude/claude_desktop_config.json):
    {
      "mcpServers": {
        "finadvisor": {
          "command": "python",
          "args": ["-m", "src.mcp.server"],
          "cwd": "/absolute/path/to/backend",
          "env": {
            "PYTHONPATH": ".",
            "SECRET_KEY": "your-secret-key"
          }
        }
      }
    }
"""

from src.mcp.server         import MCPServer, main as run_mcp_server
from src.mcp.tools_registry import (
    MCP_TOOLS,
    get_tool_schema,
    get_tools_by_category,
    get_all_tool_names,
    get_mcp_tool_list,
)

__all__ = [
    "MCPServer",
    "run_mcp_server",
    "MCP_TOOLS",
    "get_tool_schema",
    "get_tools_by_category",
    "get_all_tool_names",
    "get_mcp_tool_list",
]

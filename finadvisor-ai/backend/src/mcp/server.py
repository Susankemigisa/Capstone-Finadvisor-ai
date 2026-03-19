"""
MCP Server — exposes all FinAdvisor tools via the Model Context Protocol.

What this enables:
    - Claude Desktop can connect and use all 32 financial tools directly
    - VS Code Copilot and other MCP-compatible agents can access the tools
    - Any external system that speaks MCP can call FinAdvisor's capabilities
      without going through the HTTP API

Transport: stdio (default) — the MCP client launches this server as a
subprocess and communicates over stdin/stdout. This is the standard
transport for local MCP servers.

How to connect from Claude Desktop:
    Add to claude_desktop_config.json:
    {
      "mcpServers": {
        "finadvisor": {
          "command": "python",
          "args": ["-m", "src.mcp.server"],
          "cwd": "/path/to/finadvisor/backend",
          "env": { "PYTHONPATH": "." }
        }
      }
    }

How to run standalone for testing:
    cd backend
    python -m src.mcp.server

Architecture:
    MCP client → stdio → MCPServer.run()
                            ├── handle_list_tools()   → tools_registry.get_mcp_tool_list()
                            └── handle_call_tool()    → _dispatch(name, args)
                                                            └── get_all_tools()[name].invoke(args)
"""

from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from src.mcp.tools_registry import get_mcp_tool_list, get_tool_schema, get_all_tool_names
from src.utils.logger import get_logger

logger = get_logger(__name__)

# MCP protocol version this server implements
MCP_PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME          = "finadvisor-ai"
SERVER_VERSION       = "1.0.0"


class MCPServer:
    """
    Minimal MCP server implementation over stdio transport.

    Implements the core MCP JSON-RPC 2.0 methods:
        initialize          — handshake + capability negotiation
        tools/list          — return all available tool schemas
        tools/call          — execute a tool and return the result
        notifications/...   — log notifications from client (ignored)

    The server runs as an async event loop reading from stdin
    and writing to stdout, one JSON-RPC message per line.
    """

    def __init__(self):
        self._initialized = False
        self._client_info: dict = {}

    async def run(self) -> None:
        """
        Main loop — read JSON-RPC requests from stdin, dispatch,
        write responses to stdout.
        """
        logger.info("mcp_server_starting", transport="stdio")

        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        loop = asyncio.get_event_loop()

        await loop.connect_read_pipe(lambda: protocol, sys.stdin)
        writer_transport, writer_protocol = await loop.connect_write_pipe(
            lambda: asyncio.BaseProtocol(), sys.stdout
        )

        while True:
            try:
                line = await reader.readline()
                if not line:
                    break

                line = line.decode("utf-8").strip()
                if not line:
                    continue

                request = json.loads(line)
                response = await self._handle(request)

                if response is not None:
                    output = json.dumps(response) + "\n"
                    writer_transport.write(output.encode("utf-8"))

            except json.JSONDecodeError as e:
                logger.warning("mcp_invalid_json", error=str(e))
                error_response = _error_response(None, -32700, "Parse error")
                writer_transport.write((json.dumps(error_response) + "\n").encode())

            except Exception as e:
                logger.error("mcp_server_error", error=str(e))
                break

        logger.info("mcp_server_stopped")

    async def _handle(self, request: dict) -> dict | None:
        """Dispatch a JSON-RPC request to the appropriate handler."""
        method  = request.get("method", "")
        req_id  = request.get("id")
        params  = request.get("params", {})

        logger.debug("mcp_request", method=method, id=req_id)

        # Notifications have no id and need no response
        if req_id is None and method.startswith("notifications/"):
            return None

        try:
            if method == "initialize":
                result = await self._handle_initialize(params)
            elif method == "tools/list":
                result = await self._handle_list_tools(params)
            elif method == "tools/call":
                result = await self._handle_call_tool(params)
            elif method == "ping":
                result = {}
            else:
                return _error_response(req_id, -32601, f"Method not found: {method}")

            return _success_response(req_id, result)

        except ToolNotFoundError as e:
            return _error_response(req_id, -32602, str(e))
        except ToolExecutionError as e:
            return _error_response(req_id, -32603, str(e))
        except Exception as e:
            logger.error("mcp_handler_error", method=method, error=str(e))
            return _error_response(req_id, -32603, "Internal server error")

    # ── Method handlers ───────────────────────────────────────

    async def _handle_initialize(self, params: dict) -> dict:
        """
        MCP handshake — exchange capabilities with the client.
        Must be the first call before any tool operations.
        """
        self._client_info = params.get("clientInfo", {})
        self._initialized = True

        logger.info(
            "mcp_initialized",
            client=self._client_info.get("name", "unknown"),
            client_version=self._client_info.get("version", "unknown"),
        )

        return {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {
                "tools": {"listChanged": False},
            },
            "serverInfo": {
                "name":    SERVER_NAME,
                "version": SERVER_VERSION,
            },
            "instructions": (
                "FinAdvisor AI — financial tools for market data, portfolio management, "
                "budgeting, tax planning, and document analysis. "
                "All tools require a user_id context for personalised operations."
            ),
        }

    async def _handle_list_tools(self, params: dict) -> dict:
        """Return the full list of available tools in MCP format."""
        tools = get_mcp_tool_list()
        logger.info("mcp_tools_listed", count=len(tools))
        return {"tools": tools}

    async def _handle_call_tool(self, params: dict) -> dict:
        """
        Execute a tool call and return the result.

        MCP tool calls have the shape:
            { "name": "get_stock_price", "arguments": { "ticker": "AAPL" } }

        Returns:
            { "content": [{ "type": "text", "text": "..." }] }
        """
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        if not tool_name:
            raise ToolNotFoundError("Tool name is required")

        schema = get_tool_schema(tool_name)
        if schema is None:
            raise ToolNotFoundError(
                f"Tool '{tool_name}' not found. "
                f"Available tools: {', '.join(get_all_tool_names()[:5])}..."
            )

        logger.info("mcp_tool_called", tool=tool_name, args=list(arguments.keys()))

        # Dispatch to the actual LangChain tool implementation
        result_text = await _dispatch_tool(tool_name, arguments)

        return {
            "content": [
                {
                    "type": "text",
                    "text": result_text,
                }
            ],
            "isError": False,
        }


# ── Tool dispatch ─────────────────────────────────────────────

async def _dispatch_tool(name: str, arguments: dict) -> str:
    """
    Call the LangChain tool implementation for the given name.

    Runs synchronous tools in a thread pool executor so they don't
    block the async event loop.
    """
    try:
        from src.tools import get_all_tools
        tools = get_all_tools()
        tool_map = {t.name: t for t in tools}

        if name not in tool_map:
            raise ToolNotFoundError(f"Tool '{name}' is registered in the MCP registry but not in the tool map.")

        tool = tool_map[name]

        # Run synchronous LangChain tools in executor to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: tool.invoke(arguments))

        return str(result) if result is not None else "Tool returned no output."

    except ToolNotFoundError:
        raise
    except Exception as e:
        logger.error("mcp_tool_dispatch_failed", tool=name, error=str(e))
        raise ToolExecutionError(f"Tool '{name}' failed: {str(e)}")


# ── JSON-RPC helpers ──────────────────────────────────────────

def _success_response(req_id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _error_response(req_id: Any, code: int, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id":      req_id,
        "error":   {"code": code, "message": message},
    }


# ── Custom exceptions ─────────────────────────────────────────

class ToolNotFoundError(Exception):
    pass

class ToolExecutionError(Exception):
    pass


# ── Entry point ───────────────────────────────────────────────

def main() -> None:
    """
    Start the MCP server.
    Called when running: python -m src.mcp.server
    """
    server = MCPServer()
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("mcp_server_interrupted")
    except Exception as e:
        logger.error("mcp_server_fatal", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()

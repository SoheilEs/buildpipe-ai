import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3000';
const JWT_TOKEN = process.env.MCP_JWT_TOKEN ?? '';

async function callApi(tool: string, args: Record<string, unknown>) {
  const response = await fetch(`${API_URL}/internal/mcp/${tool}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT_TOKEN}`,
      ...(args.otp ? { 'x-otp-code': String(args.otp) } : {}),
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

const server = new Server(
  { name: 'buildpipe-ai', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_pods',
      description: 'List pods in a Kubernetes cluster',
      inputSchema: {
        type: 'object',
        properties: {
          clusterId: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['clusterId'],
      },
    },
    {
      name: 'get_logs',
      description: 'Get pod logs from a cluster',
      inputSchema: {
        type: 'object',
        properties: {
          clusterId: { type: 'string' },
          namespace: { type: 'string' },
          podName: { type: 'string' },
        },
        required: ['clusterId', 'namespace', 'podName'],
      },
    },
    {
      name: 'get_events',
      description: 'List Kubernetes events',
      inputSchema: {
        type: 'object',
        properties: {
          clusterId: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['clusterId'],
      },
    },
    {
      name: 'analyze_incident',
      description: 'Run AI analysis on an incident',
      inputSchema: {
        type: 'object',
        properties: {
          incidentId: { type: 'string' },
        },
        required: ['incidentId'],
      },
    },
    {
      name: 'cluster_health',
      description: 'Get cluster health summary',
      inputSchema: {
        type: 'object',
        properties: {
          clusterId: { type: 'string' },
        },
        required: ['clusterId'],
      },
    },
    {
      name: 'restart_deployment',
      description: 'Restart a deployment (requires OTP)',
      inputSchema: {
        type: 'object',
        properties: {
          clusterId: { type: 'string' },
          namespace: { type: 'string' },
          deploymentName: { type: 'string' },
          otp: { type: 'string' },
        },
        required: ['clusterId', 'namespace', 'deploymentName', 'otp'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args ?? {}) as Record<string, unknown>;

  const result = await callApi(name, toolArgs);

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Infralark MCP Server running on stdio');
}

main().catch(console.error);

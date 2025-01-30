#!/usr/bin/env node
import { Server } from '@highlight-ai/mcp-sdk/server/index.js'
import { StdioServerTransport } from '@highlight-ai/mcp-sdk/server/stdio.js'
import {
    ListToolsRequestSchema,
    GetAuthTokenRequestSchema,
    CallToolRequestSchema,
    ErrorCode,
    McpError,
} from '@highlight-ai/mcp-sdk/types.js'
import { z } from 'zod'
import { YoutubeTranscript } from 'youtube-transcript'

/**
 * Helper function to extract video ID from YouTube URL
 */
export function getVideoId(url: string): string {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(regex)
    if (!match) throw new Error('Invalid YouTube URL')
    return match[1]
}

/**
 * Get transcript from a YouTube video URL
 */
export async function getTranscript(url: string): Promise<string> {
    if (!url) {
        throw new Error('URL is required')
    }

    try {
        const videoId = getVideoId(url)
        const transcript = await YoutubeTranscript.fetchTranscript(videoId)
        return transcript.map((item) => item.text).join(' ')
    } catch (error) {
        throw new Error(`Failed to get transcript: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

class YoutubeTranscriptServer {
    private server: Server

    constructor() {
        this.server = new Server(
            {
                name: 'youtube-transcript-server',
                version: '0.0.1',
            },
            {
                capabilities: {
                    resources: {},
                    tools: {},
                },
            },
        )

        this.setupHandlers()
        this.setupErrorHandling()
    }

    private setupErrorHandling(): void {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error)
        }

        process.on('SIGINT', async () => {
            await this.server.close()
            process.exit(0)
        })
    }

    private setupHandlers(): void {
        this.setupToolHandlers()
    }

    private setupToolHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'get_youtube_transcript',
                    description: 'Get the transcript of a youtube video',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            videoUrl: {
                                type: 'string',
                                description: 'The url of the youtube video',
                            },
                        },
                        required: ['videoUrl'],
                    },
                },
            ],
        }))

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name !== 'get_youtube_transcript') {
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
            }

            const url = String(request.params.arguments?.videoUrl)
            const transcriptText = await getTranscript(url)

            return {
                content: [
                    {
                        type: 'text',
                        text: transcriptText,
                    },
                ],
            }
        })
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport()
        await this.server.connect(transport)
        console.log('Youtube Transcript MCP server running on stdio')
    }
}

const server = new YoutubeTranscriptServer()
server.run().catch(console.error)

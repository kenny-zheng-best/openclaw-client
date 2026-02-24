import { useEffect, useState } from 'react'
import { Server, Plus, Trash2, Cable, Plug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { listMcpServers, importMcpConfig, removeMcpServer, type McpEntry } from '@/api/openclaw'

const TRANSPORT_OPTIONS = ['stdio', 'sse', 'streamable-http'] as const

const RECOMMENDED_TEMPLATES = [
  { name: 'Filesystem', transport: 'stdio', endpoint: 'npx -y @modelcontextprotocol/server-filesystem /tmp' },
  { name: 'Web Search', transport: 'sse', endpoint: 'http://localhost:3001/sse' },
  { name: 'GitHub', transport: 'stdio', endpoint: 'npx -y @modelcontextprotocol/server-github' },
]

export function McpPanel() {
  const [servers, setServers] = useState<McpEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formTransport, setFormTransport] = useState<string>('stdio')
  const [formEndpoint, setFormEndpoint] = useState('')
  const [importing, setImporting] = useState(false)

  const loadServers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listMcpServers()
      setServers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 MCP 服务列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadServers()
  }, [])

  const handleImport = async () => {
    if (!formName.trim() || !formEndpoint.trim()) return
    setImporting(true)
    try {
      const entry = await importMcpConfig({
        name: formName.trim(),
        transport: formTransport,
        endpoint: formEndpoint.trim(),
      })
      setServers((prev) => [...prev, entry])
      setFormName('')
      setFormTransport('stdio')
      setFormEndpoint('')
      setImportOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入 MCP 配置失败')
    } finally {
      setImporting(false)
    }
  }

  const handleRemove = async (mcpId: string) => {
    try {
      await removeMcpServer(mcpId)
      setServers((prev) => prev.filter((s) => s.id !== mcpId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除 MCP 服务失败')
    }
  }

  const handleUseTemplate = async (template: typeof RECOMMENDED_TEMPLATES[number]) => {
    setImporting(true)
    try {
      const entry = await importMcpConfig({
        name: template.name,
        transport: template.transport,
        endpoint: template.endpoint,
      })
      setServers((prev) => [...prev, entry])
    } catch (err) {
      setError(err instanceof Error ? err.message : '应用模板失败')
    } finally {
      setImporting(false)
    }
  }

  const statusVariant = (status: McpEntry['status']) => {
    switch (status) {
      case 'connected':
        return 'default' as const
      case 'disconnected':
        return 'secondary' as const
      case 'error':
        return 'destructive' as const
    }
  }

  const statusLabel = (status: McpEntry['status']) => {
    switch (status) {
      case 'connected':
        return '已连接'
      case 'disconnected':
        return '未连接'
      case 'error':
        return '错误'
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cable className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">MCP 配置</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportOpen(!importOpen)}
        >
          <Plus className="h-4 w-4" />
          导入配置
        </Button>
      </div>

      {importOpen && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">名称</label>
            <Input
              placeholder="输入 MCP 服务名称"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">传输协议</label>
            <div className="flex gap-2">
              {TRANSPORT_OPTIONS.map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant={formTransport === opt ? 'default' : 'outline'}
                  onClick={() => setFormTransport(opt)}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">端点</label>
            <Input
              placeholder="输入端点地址或命令"
              value={formEndpoint}
              onChange={(e) => setFormEndpoint(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleImport()
              }}
            />
          </div>
          <Button
            size="sm"
            onClick={() => void handleImport()}
            disabled={importing || !formName.trim() || !formEndpoint.trim()}
          >
            {importing ? '导入中...' : '确认导入'}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-5">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">已配置服务</h3>

        {loading && (
          <p className="text-sm text-muted-foreground">加载中...</p>
        )}

        {!loading && servers.length === 0 && !error && (
          <Card className="border-border bg-muted/50">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Server className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">暂无已配置的 MCP 服务</p>
              <p className="mt-1 text-xs text-muted-foreground">点击上方「导入配置」或从推荐模板开始</p>
            </CardContent>
          </Card>
        )}

        {!loading && servers.length > 0 && (
          <div className="grid gap-3">
            {servers.map((server) => (
              <Card key={server.id} className="border-border bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">{server.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(server.status)}>{statusLabel(server.status)}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => void handleRemove(server.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>传输协议: {server.transport}</span>
                    <span>端点: {server.endpoint}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">推荐模板</h3>
        <div className="grid gap-3">
          {RECOMMENDED_TEMPLATES.map((tpl) => (
            <Card key={tpl.name} className="border-border bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">{tpl.name}</CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={importing}
                  onClick={() => void handleUseTemplate(tpl)}
                >
                  使用模板
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>传输协议: {tpl.transport}</span>
                  <span>端点: {tpl.endpoint}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

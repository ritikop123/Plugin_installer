<?php

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Demo\DemoPanelService;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class DemoModeMiddleware
{
    public function __construct(private DemoPanelService $demo)
    {
    }

    /**
     * Enforce demo account restrictions and serve virtual dummy server responses.
     */
    public function handle(Request $request, Closure $next): mixed
    {
        $path = ltrim($request->path(), '/');
        $isWrite = !in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true);

        // Always allow login & logout flows.
        if ($path === 'auth/logout' || $path === 'auth/login' || $path === 'auth/login/checkpoint') {
            return $next($request);
        }

        // Prevent password reset emails / resets targeting the demo account.
        if ($isWrite && ($path === 'auth/password' || $path === 'auth/password/reset')) {
            $email = (string) $request->input('email', '');
            if ($this->demo->isDemoEmail($email)) {
                return $this->demo->blockedResponse('Password reset is disabled for the demo account.');
            }
        }

        $user = $request->user();
        $isDemoUser = $this->demo->isDemoUser($user);

        // Protect all account endpoints & web profile mutations for the demo user.
        if ($isDemoUser && $isWrite) {
            if (str_starts_with($path, 'api/client/account')) {
                return $this->demo->blockedResponse($this->accountBlockMessage($path));
            }

            if (!str_starts_with($path, 'api/')) {
                return $this->demo->blockedResponse('This action is disabled for the demo account in preview mode.');
            }
        }

        // Handle server-scoped Client API routes (both simulation and write protection).
        if (preg_match('#^api/client/servers/([^/]+)(?:/(.*))?$#', $path, $matches)) {
            $server = $this->resolveServer($request, $matches[1]);
            $subPath = trim((string) ($matches[2] ?? ''), '/');

            if ($server instanceof Server) {
                if ($isDemoUser && !$this->demo->isDemoServer($server)) {
                    return $this->demo->blockedResponse('Demo account can only access the demo preview server.');
                }

                if ($this->demo->isDemoServer($server)) {
                    if (!$this->demo->userCanAccessServer($user, $server)) {
                        throw new NotFoundHttpException('The requested resource does not exist.');
                    }

                    return $this->handleDemoServerRequest($request, $server, $subPath, $isWrite, $next);
                }
            }
        }

        // Catch-all safety net: demo users cannot execute non-server client API mutations.
        if ($isDemoUser && $isWrite && str_starts_with($path, 'api/client')) {
            return $this->demo->blockedResponse('Modifications are disabled for the demo account in preview mode.');
        }

        return $next($request);
    }

    /**
     * Resolve the target Server model from route binding or UUID/short UUID.
     */
    private function resolveServer(Request $request, string $identifier): ?Server
    {
        $bound = $request->route()?->parameter('server');
        if ($bound instanceof Server) {
            return $bound;
        }

        $clean = trim($identifier);
        if ($clean === '') {
            return null;
        }

        return Server::query()
            ->when(
                str_starts_with($clean, 'serv_'),
                fn ($q) => $q->where('uuid', $clean),
                fn ($q) => $q->where(strlen($clean) === 8 ? 'uuidShort' : 'uuid', $clean)
            )
            ->first();
    }

    /**
     * Handle read simulations and block mutations/power control on the dummy server.
     */
    private function handleDemoServerRequest(
        Request $request,
        Server $server,
        string $subPath,
        bool $isWrite,
        Closure $next
    ): mixed {
        if (!$isWrite) {
            return match ($subPath) {
                'resources' => response()->json($this->demo->getResourcesPayload($server)),
                'websocket' => response()->json($this->demo->getWebsocketPayload()),
                'files/list' => response()->json(
                    $this->demo->getDirectoryListing((string) $request->query('directory', '/'))
                ),
                'files/contents' => $this->serveDemoFileContents($server, (string) $request->query('file', '')),
                'files/download', 'files/upload' => $this->demo->blockedResponse(
                    'File downloads and uploads are disabled in demo preview mode.'
                ),
                'plugins/installed' => response()->json($this->demo->getInstalledPlugins()),
                'mods/installed' => response()->json($this->demo->getInstalledMods()),
                'modpacks/installed' => response()->json($this->demo->getInstalledModpack()),
                'software/current' => response()->json($this->demo->getCurrentSoftware()),
                'options' => response()->json($this->demo->getServerOptions($server)),
                'players' => response()->json($this->demo->getPlayersIndex($server)),
                'players/detail' => response()->json($this->demo->getPlayerDetail(
                    (string) $request->query('player', ''),
                    (string) $request->query('uuid', '')
                )),
                'worlds', 'world' => response()->json($this->demo->getWorldsIndex($server)),
                'worlds/options', 'world/options' => response()->json(
                    $this->demo->getWorldOptions((string) $request->query('world', 'world'))
                ),
                'ai/info' => response()->json($this->demo->getAiInfo($server)),
                default => $this->handleSafeBackupDownloadBlock($subPath, $request, $next),
            };
        }

        // Allow safe, read-only AI diagnostic & chat previews without calling external APIs or Wings.
        if ($subPath === 'ai/diagnose') {
            return response()->json($this->demo->getAiDiagnose());
        }

        if ($subPath === 'ai/chat') {
            return response()->json($this->demo->getAiChat((string) $request->input('message', '')));
        }

        return $this->demo->blockedResponse($this->serverBlockMessage($subPath));
    }

    private function handleSafeBackupDownloadBlock(string $subPath, Request $request, Closure $next): mixed
    {
        if (preg_match('#^backups/[^/]+/download$#', $subPath)) {
            return $this->demo->blockedResponse('Backup downloads are disabled in demo preview mode.');
        }

        return $next($request);
    }

    private function serveDemoFileContents(Server $server, string $file): Response|mixed
    {
        $content = $this->demo->getFileContents($server, $file);
        if ($content === null) {
            return $this->demo->blockedResponse('This preview file cannot be opened in demo mode.', 404);
        }

        return new Response($content, Response::HTTP_OK, ['Content-Type' => 'text/plain']);
    }

    private function accountBlockMessage(string $path): string
    {
        return match (true) {
            str_contains($path, '/email') => 'Demo account email cannot be changed in preview mode.',
            str_contains($path, '/password') => 'Demo account password cannot be changed in preview mode.',
            str_contains($path, '/two-factor') => 'Two-factor authentication cannot be changed on the demo account.',
            str_contains($path, '/api-keys') => 'API keys cannot be created or deleted on the demo account.',
            str_contains($path, '/ssh-keys') => 'SSH keys cannot be added or removed on the demo account.',
            default => 'Demo account name, email, and password cannot be changed in preview mode.',
        };
    }

    private function serverBlockMessage(string $subPath): string
    {
        return match (true) {
            $subPath === 'power' => 'This demo server cannot be started or controlled in preview mode.',
            $subPath === 'command' => 'Demo server is offline. Console commands are disabled in preview mode.',
            str_starts_with($subPath, 'files') => 'Files cannot be modified, uploaded, or deleted on the demo server.',
            str_starts_with($subPath, 'plugins') => 'Plugin installation and deletion are disabled on the demo server.',
            str_starts_with($subPath, 'mods') => 'Mod installation and deletion are disabled on the demo server.',
            str_starts_with($subPath, 'modpacks') => 'Modpack installation and removal are disabled on the demo server.',
            str_starts_with($subPath, 'software') => 'Server software changes are disabled on the demo server.',
            str_starts_with($subPath, 'options') || $subPath === 'subscription' => 'Server options cannot be modified in demo preview mode.',
            str_starts_with($subPath, 'players') => 'Player management actions are disabled on the demo server.',
            str_starts_with($subPath, 'world') => 'World changes are disabled on the demo server.',
            str_starts_with($subPath, 'backups') || str_starts_with($subPath, 'auto-backup') => 'Backup modifications and Google Drive linking are disabled in demo preview mode.',
            str_starts_with($subPath, 'ai') => 'AI auto-fix mutations are disabled on the demo server in preview mode.',
            default => 'Server configuration changes cannot be saved in demo preview mode.',
        };
    }
}

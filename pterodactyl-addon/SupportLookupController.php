<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class SupportLookupController extends ClientApiController
{
    /**
     * Search servers by Support ID, name, or UUID.
     * Restricted strictly to administrators (rootAdmin).
     *
     * GET /api/client/support-lookup?query=...
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->root_admin) {
            throw new AccessDeniedHttpException('This endpoint is restricted to administrators.');
        }

        $query = trim((string) ($request->query('query') ?? $request->query('support_id') ?? ''));
        if ($query === '') {
            return response()->json(['data' => []]);
        }

        $clean = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $query));
        $code = (substr($clean, 0, 3) === 'SUP') ? substr($clean, 3) : $clean;

        $servers = Server::query()
            ->where(function ($q) use ($query, $clean, $code) {
                if (!empty($code)) {
                    $q->where('support_id', 'LIKE', "%{$code}%")
                      ->orWhere('support_id', 'LIKE', "SUP-{$code}%");
                }
                if (!empty($clean)) {
                    $q->orWhere('support_id', 'LIKE', "%{$clean}%");
                }
                $q->orWhere('uuid', 'LIKE', "{$query}%")
                  ->orWhere('uuidShort', 'LIKE', "{$query}%")
                  ->orWhere('name', 'LIKE', "%{$query}%");
            })
            ->with(['node', 'user'])
            ->limit(8)
            ->get();

        $results = $servers->map(function (Server $server) {
            $supId = $server->support_id;
            if (empty($supId) && !empty($server->uuid)) {
                $supId = 'SUP-' . strtoupper(substr(str_replace('-', '', $server->uuid), 0, 6));
            }

            return [
                'id' => $server->id,
                'uuid' => $server->uuid,
                'uuidShort' => substr($server->uuid, 0, 8),
                'name' => $server->name,
                'description' => $server->description,
                'support_id' => $supId,
                'node' => $server->node?->name ?? 'Default Node',
                'owner' => $server->user?->username ?? 'Unknown',
                'status' => $server->status,
                'is_suspended' => $server->isSuspended(),
            ];
        });

        return response()->json(['data' => $results]);
    }
}

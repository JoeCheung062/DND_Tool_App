import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { CombinationDeck } from "../components/CombinationDeck";
import { SoundDeck, SoundEffectList } from "../components/SoundDeck";
import { InitiativePanel } from "../components/InitiativePanel";
import { MapCanvas } from "../components/MapCanvas";
import { MaterialMarkMenu } from "../components/MaterialMarkMenu";
import { ZonePreview } from "../components/ZonePreview";
import { api, getApiBase, getToken, type Combination, type Material, type Room } from "../lib/api";
import { normalizePlacement, zoomPlacement, type MaterialPlacement } from "../lib/canvasLayers";
import { emptyInitiative, type InitiativeBoard } from "../lib/initiative";
import { emptyMarks, parseRoomSession, rememberColor, rememberText, type RoomMarks, type RoomSession } from "../lib/roomSession";
import { SelectCampaignStep } from "./SelectCampaignStep";
import {
  LIBRARY_KINDS,
  belongsInAssetLibrary,
  libraryKind,
  libraryKindLabel,
  matchesLibraryQuery,
  type LibraryKind,
} from "../lib/controlLibrary";
import {
  connectControlRoom,
  leaveControlRoom,
  listRoomDisplays,
  publishMaterialOffer,
  type ControlDisplay,
  type ControlMaterialOffer,
} from "../lib/controlSession";
import { buildPlayAssignments, combinationMaterialIds } from "../lib/controlPlay";
import { getDisplayApi } from "../lib/displayApi";
import type { MapMeasure, MeasureMode } from "../lib/mapMeasure";
import { syncNpcZones, zoneHeading } from "../lib/sceneMode";
import {
  addLayer,
  applyEnvironmentPack,
  assignmentsForZones,
  assignOpenScreens,
  emptyZones,
  parseTarget,
  reorderLayers,
  screenKey,
  shiftLayer,
  type ZoneConfig,
  type ZoneLayer,
} from "../lib/controlZones";
import {
  addMapMaterial,
  assignmentsForMap,
  clampMapZoom,
  emptyMapScreen,
  mapFrameOf,
  withGridSize,
  type MapScreenConfig,
} from "../lib/controlMap";
import { allSpeakers, clampVolume, withoutScreen, type SoundAction, type SoundChannel, type SpeakerTarget } from "../lib/soundDeck";

type LibraryItem = Material & {
  localUrl: string;
  characterArtLocalUrl?: string;
  tags: Array<{ id: string; name: string }>;
};

type LogLine = { id: string; text: string };

function RouteSelects({
  label,
  screenKey,
  speakerKey,
  screens,
  onScreen,
  onSpeaker,
  volume,
  onVolume,
}: {
  label: string;
  screenKey: string;
  speakerKey: string;
  screens: Array<{ key: string; label: string; speakerLabel: string }>;
  onScreen: (screenKey: string) => void;
  onSpeaker: (speakerKey: string) => void;
  volume: number;
  onVolume: (percent: number) => void;
}) {
  return (
    <div className="route-card">
      <strong>{label}</strong>
      <label>
        Screen
        <select value={screenKey} onChange={(event) => onScreen(event.target.value)}>
          <option value="">Not connected</option>
          {screens.map((screen) => (
            <option key={screen.key} value={screen.key}>
              {screen.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Speaker
        <select value={speakerKey} onChange={(event) => onSpeaker(event.target.value)}>
          <option value="">Not connected</option>
          {screens.map((screen) => (
            <option key={screen.key} value={screen.key}>
              {screen.speakerLabel}
            </option>
          ))}
        </select>
      </label>
      {speakerKey ? (
        <label className="volume-row">
          Volume
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            aria-label={`${label} speaker volume`}
            aria-valuetext={`${Math.round(volume * 100)}%`}
            onChange={(event) => onVolume(Number(event.target.value))}
          />
          <span className="mono">{Math.round(volume * 100)}%</span>
        </label>
      ) : null}
    </div>
  );
}

function ConnectedScreen({
  display,
  screen,
}: {
  display: ControlDisplay;
  screen: ControlDisplay["screens"][number];
}) {
  return (
    <span className="screen-pill" title={`${display.clientId} · ${screen.bounds.width}×${screen.bounds.height}`}>
      Screen {screen.id}
      {screen.primary ? " · primary" : ""}
    </span>
  );
}

function EnvironmentPackList({
  packs,
  library,
  query,
  activeId,
  onQuery,
  onSelect,
}: {
  packs: Combination[];
  library: LibraryItem[];
  query: string;
  activeId: string | null;
  onQuery: (value: string) => void;
  onSelect: (pack: Combination) => void;
}) {
  const needle = query.trim().toLowerCase();
  const visible = packs.filter((pack) => {
    if (!needle) return true;
    if (pack.name.toLowerCase().includes(needle)) return true;
    return [pack.zone1Material, pack.zone2Material, pack.zone3Material, pack.zone4Material].some(
      (material) => material?.name.toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search environment packs"
        aria-label="Search environment packs"
      />
      <p className="muted">Click a pack to add its image to each zone. It is not sent to every screen.</p>
      <div className="asset-grid">
        {packs.length === 0 ? <p className="muted">No environment packs yet.</p> : null}
        {packs.length > 0 && visible.length === 0 ? (
          <p className="muted">No environment packs match.</p>
        ) : null}
        {visible.map((pack) => {
          const shots = [
            { zone: 1, material: pack.zone1Material, id: pack.zone1MaterialId },
            { zone: 2, material: pack.zone2Material, id: pack.zone2MaterialId },
            { zone: 3, material: pack.zone3Material, id: pack.zone3MaterialId },
            { zone: 4, material: pack.zone4Material, id: pack.zone4MaterialId },
          ].map((slot) => {
            const saved = library.find((item) => item.id === (slot.id || slot.material?.id));
            return {
              zone: slot.zone,
              name: slot.material?.name ?? saved?.name ?? "",
              url: saved?.localUrl ?? "",
            };
          });
          return (
            <article
              key={pack.id}
              className={pack.id === activeId ? "asset-card pack on" : "asset-card pack"}
            >
              <strong>{pack.name}</strong>
              <div className="pack-preview" aria-label={`${pack.name} preview`}>
                {shots.map((shot) => (
                  <figure key={shot.zone} className="pack-shot">
                    {shot.url ? (
                      <img src={shot.url} alt={shot.name || zoneHeading(shot.zone)} />
                    ) : (
                      <span className="pack-empty">{shot.name || "Empty"}</span>
                    )}
                    <figcaption>{zoneHeading(shot.zone)}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="asset-actions">
                <button type="button" className="btn tiny" onClick={() => onSelect(pack)}>
                  Add to zones
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function ControlSessionPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [roomBoot, setRoomBoot] = useState<"loading" | "ready" | "failed">("loading");
  const [marks, setMarks] = useState<RoomMarks>(emptyMarks);
  const [markMenu, setMarkMenu] = useState<{
    scope: ZoneConfig["number"] | "map";
    layerId?: string;
    x: number;
    y: number;
    step?: "root" | "kind" | "text" | "color";
    color?: string;
  } | null>(null);
  const [measureArm, setMeasureArm] = useState<MeasureMode | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [displays, setDisplays] = useState<ControlDisplay[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [activeCombinationId, setActiveCombinationId] = useState<string | null>(null);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [libraryPanel, setLibraryPanel] = useState<
    "assets" | "packs" | "bgm" | "effects" | "combinations" | "settings"
  >("assets");
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [failedDownloads, setFailedDownloads] = useState<Array<{ id: string; error: string }>>([]);
  const [zones, setZones] = useState<ZoneConfig[]>(emptyZones);
  const [activeZone, setActiveZone] = useState<ZoneConfig["number"]>(1);
  const [zoneView, setZoneView] = useState<"all" | "map" | ZoneConfig["number"]>("all");
  const [mapScreen, setMapScreen] = useState<MapScreenConfig>(emptyMapScreen);
  const [initiative, setInitiative] = useState<InitiativeBoard>(emptyInitiative);
  const [speakerVolumes, setSpeakerVolumes] = useState<Record<string, number>>({});
  const [sessionReady, setSessionReady] = useState(false);
  const initiativeRef = useRef(initiative);
  initiativeRef.current = initiative;
  const speakerVolumesRef = useRef(speakerVolumes);
  speakerVolumesRef.current = speakerVolumes;
  const bgmLevelRef = useRef(0.8);
  const materialOfferRef = useRef<ControlMaterialOffer | null>(null);
  const npcSent = useRef<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const sessionPayloadRef = useRef<RoomSession | null>(null);
  if (sessionReady && loadedFor.current === roomId) {
    sessionPayloadRef.current = {
      zones,
      activeZone,
      zoneView,
      map: mapScreen,
      initiative,
      marks,
      speakerVolumes,
    };
  }
  const [selectedMaterial, setSelectedMaterial] = useState<{
    scope: ZoneConfig["number"] | "map";
    layerId: string;
  } | null>(null);

  useEffect(() => {
    const deselect = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest) return;
      if (target.closest(".zone-preview, .map-output, .layer-row")) return;
      setSelectedMaterial(null);
    };
    document.addEventListener("pointerdown", deselect);
    return () => document.removeEventListener("pointerdown", deselect);
  }, []);

  useEffect(() => {
    if (zoneView !== "map") return;
    const screen = parseTarget(mapScreen.screenKey);
    if (!screen) return;
    const frame = mapFrameOf(mapScreen);
    const timer = window.setTimeout(() => {
      socketRef.current?.emit("map:camera", {
        roomId,
        clientId: screen.clientId,
        screenId: screen.screenId,
        map: frame,
      });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [
    zoneView,
    roomId,
    mapScreen.screenKey,
    mapScreen.columns,
    mapScreen.rows,
    mapScreen.focusCol,
    mapScreen.focusRow,
    mapScreen.zoom,
  ]);
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [kind, setKind] = useState<LibraryKind | "all">("all");
  const [status, setStatus] = useState("Connecting to Display Mode devices…");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const libraryRef = useRef<LibraryItem[]>([]);
  libraryRef.current = library;
  const previewAudios = useRef<HTMLAudioElement[]>([]);
  const [zonePlayback, setZonePlayback] = useState<{
    token: number;
    zone: ZoneConfig["number"];
    materials: LibraryItem[];
    audios: HTMLAudioElement[];
  } | null>(null);

  function publishMeasure(measure: MapMeasure | null) {
    const screen = parseTarget(mapScreen.screenKey);
    const activeSocket = socketRef.current;
    if (!screen || !activeSocket) return;
    activeSocket.emit("map:measure", {
      roomId,
      clientId: screen.clientId,
      screenId: screen.screenId,
      measure,
    });
  }

  function stopPreviewAudio() {
    for (const audio of previewAudios.current) {
      audio.pause();
      audio.removeAttribute("src");
    }
    previewAudios.current = [];
  }

  function pushLog(text: string) {
    setLog((prev) => [{ id: `${Date.now()}-${prev.length}`, text }, ...prev].slice(0, 8));
  }

  function transmitAssignments(
    assignments: ReturnType<typeof assignmentsForZones>,
    label: string
  ) {
    const activeSocket = socketRef.current;
    if (!activeSocket || assignments.length === 0) return;
    const requestId = `control-${Date.now()}`;
    activeSocket.emit(
      "material:play",
      { roomId, requestId, assignments },
      (response: { ok?: boolean; error?: string }) => {
        if (!response?.ok) {
          setError(response?.error || "Play failed");
          return;
        }
        pushLog(`${label} · ${requestId}`);
      }
    );
  }

  function transmit(nextZones: ZoneConfig[], label: string) {
    const types = new Map(libraryRef.current.map((item) => [item.id, item.type]));
    transmitAssignments(assignmentsForZones(nextZones, types), label);
  }

  function publishInitiative(next: InitiativeBoard) {
    initiativeRef.current = next;
    setInitiative(next);
    socketRef.current?.emit("initiative:update", { roomId, board: next });
  }

  function transmitMap() {
    const types = new Map(libraryRef.current.map((item) => [item.id, item.type]));
    transmitAssignments(assignmentsForMap(mapScreen, types), "Map screen");
  }

  const previewToken = useRef(0);
  function startPreviewAudio(token: number) {
    if (previewToken.current === token) return;
    previewToken.current = token;
    for (const audio of previewAudios.current) {
      void audio.play().catch(() => {
        (audio as HTMLAudioElement & { previewFailed?: boolean }).previewFailed = true;
        audio.dispatchEvent(new Event("error"));
      });
    }
  }

  function previewMaterials(ids: string[]) {
    stopPreviewAudio();
    const materials = [...new Set(ids)].flatMap((id) => {
      const item = libraryRef.current.find((entry) => entry.id === id);
      if (!item?.localUrl) return [];
      return [item];
    });
    if (materials.length === 0) return;
    const audios = materials.flatMap((item) => {
      if (item.type.toUpperCase() !== "SOUND") return [];
      const audio = new Audio(item.localUrl);
      audio.preload = "auto";
      return [audio];
    });
    previewAudios.current = audios;
    const zoneNumber = typeof zoneView === "number" ? zoneView : activeZone;
    setActiveZone(zoneNumber);
    if (zoneView === "map") setZoneView(zoneNumber);
    setZonePlayback({ token: Date.now(), zone: zoneNumber, materials, audios });
  }

  function sendSound(
    channel: SoundChannel,
    action: SoundAction,
    materialId: string | undefined,
    volume: number,
    position?: number,
    only?: SpeakerTarget[]
  ) {
    const activeSocket = socketRef.current;
    if (!activeSocket) return;
    const targets = only ?? allSpeakers(displays);
    if (targets.length === 0) {
      setError("Connect a Display Mode device before playing sound");
      return;
    }
    setError(null);
    const buckets = new Map<string, { volume: number; gain: number; targets: SpeakerTarget[] }>();
    for (const target of targets) {
      const gain = clampVolume(speakerVolumesRef.current[screenKey(target.clientId, target.screenId)] ?? 1);
      const level = clampVolume(volume * gain);
      const bucketKey = `${level}:${gain}`;
      const bucket = buckets.get(bucketKey) ?? { volume: level, gain, targets: [] };
      bucket.targets.push(target);
      buckets.set(bucketKey, bucket);
    }
    let logged = false;
    for (const bucket of buckets.values()) {
      const requestId = `sound-${Date.now()}-${bucket.targets.length}`;
      activeSocket.emit(
        "sound:play",
        {
          roomId,
          requestId,
          channel,
          action,
          materialId,
          volume: bucket.volume,
          gain: bucket.gain,
          position,
          targets: bucket.targets,
        },
        (response: { ok?: boolean; error?: string }) => {
          if (!response?.ok) {
            setError(response?.error || "Sound command failed");
            return;
          }
          if (logged || action === "volume" || action === "seek") return;
          logged = true;
          const name = materialId
            ? libraryRef.current.find((item) => item.id === materialId)?.name
            : undefined;
          const label =
            action === "stop"
              ? "BGM stopped"
              : action === "pause"
                ? "BGM paused"
                : `${channel === "bgm" ? "BGM" : "Effect"} ${name ?? materialId}`;
          pushLog(`${label} · ${targets.length} speaker${targets.length === 1 ? "" : "s"}`);
        }
      );
    }
  }

  function changeSpeakerVolume(key: string, percent: number) {
    const gain = clampVolume(percent / 100);
    const next = { ...speakerVolumesRef.current, [key]: gain };
    speakerVolumesRef.current = next;
    setSpeakerVolumes(next);
    const target = parseTarget(key);
    if (!target) return;
    sendSound("bgm", "volume", undefined, bgmLevelRef.current, undefined, [target]);
  }

  function playCombination(combination: Combination) {
    const activeSocket = socketRef.current;
    if (!activeSocket) return;
    const targets = withoutScreen(allSpeakers(displays), parseTarget(mapScreen.screenKey));
    if (targets.length === 0) {
      setError("Connect a Display Mode device before playing a combination");
      return;
    }
    const materialIds = combinationMaterialIds(combination).filter((id) =>
      libraryRef.current.some((item) => item.id === id)
    );
    if (materialIds.length === 0) {
      setError(`“${combination.name}” has no materials on this device`);
      return;
    }
    setError(null);
    setActiveCombinationId(combination.id);
    const requestId = `combo-${Date.now()}`;
    const assignments = buildPlayAssignments({
      screens: targets,
      materialIds,
      combinationId: combination.id,
      once: true,
    });
    activeSocket.emit(
      "material:play",
      { roomId, requestId, assignments },
      (response: { ok?: boolean; error?: string }) => {
        if (!response?.ok) {
          setError(response?.error || "Combination command failed");
          return;
        }
        pushLog(
          `${combination.name} · ${targets.length} screen${targets.length === 1 ? "" : "s"}`
        );
      }
    );
    const visualIds = materialIds.filter((id) => {
      const item = libraryRef.current.find((entry) => entry.id === id);
      return Boolean(item && item.type.toUpperCase() !== "SOUND");
    });
    if (visualIds.length > 0) previewMaterials(visualIds);
  }

  useEffect(() => {
    let alive = true;
    loadedFor.current = null;
    npcSent.current = null;
    setSessionReady(false);
    setCampaignId(null);
    setMarks(emptyMarks());
    setMarkMenu(null);
    setRoomBoot("loading");
    setZones(emptyZones());
    setMapScreen(emptyMapScreen());
    setInitiative(emptyInitiative());
    setActiveZone(1);
    setZoneView("all");
    setSpeakerVolumes({});
    (async () => {
      try {
        const loaded = await api.getRoom(roomId);
        if (!alive) return;
        const saved = parseRoomSession(loaded.session);
        if (saved) {
          setZones(saved.zones);
          setMapScreen(saved.map);
          setInitiative(saved.initiative);
          initiativeRef.current = saved.initiative;
          setActiveZone(saved.activeZone);
          setZoneView(saved.zoneView);
          setSpeakerVolumes(saved.speakerVolumes);
        }
        setRoom(loaded);
        loadedFor.current = roomId;
        setSessionReady(true);
        if (loaded.campaignId) setCampaignId(loaded.campaignId);
        setMarks(saved?.marks ?? emptyMarks());
        setRoomBoot("ready");
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load room");
        setStatus("Failed");
        setRoomBoot("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomId]);

  useEffect(() => {
    const id = roomId;
    return () => {
      const payload = sessionPayloadRef.current;
      if (loadedFor.current !== id || !payload) return;
      loadedFor.current = null;
      void api.updateRoom(id, { session: payload }).catch(() => undefined);
    };
  }, [roomId]);

  useEffect(() => {
    if (!sessionReady || loadedFor.current !== roomId) return;
    const payload: RoomSession = {
      zones,
      activeZone,
      zoneView,
      map: mapScreen,
      initiative,
      marks,
      speakerVolumes,
    };
    sessionPayloadRef.current = payload;
    const timer = window.setTimeout(() => {
      void api.updateRoom(roomId, { session: payload }).catch((err) => {
        setError(err instanceof Error ? err.message : "Could not save the room");
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [sessionReady, roomId, zones, activeZone, zoneView, mapScreen, initiative, marks, speakerVolumes]);

  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  useEffect(() => {
    if (!sessionReady || loadedFor.current !== roomId) return;
    const current = zonesRef.current;
    const next = syncNpcZones(
      current,
      mapScreen.layers,
      mapScreen.sceneLabels,
      new Map(library.map((item) => [item.id, item])),
      mapScreen.sceneCenter
    );
    if (next !== current) {
      zonesRef.current = next;
      setZones(next);
    }
    const timer = window.setTimeout(() => {
      if (!socketRef.current) return;
      const latest = zonesRef.current;
      const signature = latest
        .flatMap((zone) =>
          zone.layers
            .filter((layer) => layer.sourceMapLayerId)
            .map((layer) =>
              [
                zone.number,
                layer.id,
                layer.materialId,
                layer.useCharacterArt === true,
                layer.x ?? 0,
                layer.y ?? 0,
              ].join(":")
            )
        )
        .join("|");
      if (signature === npcSent.current) return;
      npcSent.current = signature;
      const types = new Map(libraryRef.current.map((item) => [item.id, item.type]));
      transmitAssignments(assignmentsForZones(latest, types), "NPC zones");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [sessionReady, roomId, socket, mapScreen.layers, mapScreen.sceneLabels, mapScreen.sceneCenter, library]);

  useEffect(() => {
    if (!campaignId) return;
    let alive = true;
    let active: Socket | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        const loadedRoom = await api.getRoom(roomId);
        if (!alive) return;
        setRoom(loadedRoom);

        setStatus("Downloading campaign and General materials…");
        const [materialList, combinationList] = await Promise.all([
          api.listCampaignMaterials(campaignId),
          api.listCombinations(),
        ]);
        const pack = await getDisplayApi().downloadMaterials({
          apiBase: getApiBase(),
          token: getToken() ?? "",
          materials: materialList,
        });
        if (!alive) return;
        const saved = new Map(pack.saved.map((item) => [item.id, item]));
        setLibrary(
          materialList
            .filter((item) => saved.has(item.id))
            .map((item) => ({
              ...item,
              tags: item.tagList ?? [],
              localUrl: saved.get(item.id)!.localUrl,
              characterArtLocalUrl: saved.get(item.id)!.characterArtLocalUrl,
            }))
        );
        setFailedDownloads(pack.failed);
        setCombinations(combinationList);
        setStatus("Connecting to Display Mode devices…");

        const session = await connectControlRoom(roomId);
        if (!alive) {
          leaveControlRoom(session.socket, roomId);
          return;
        }
        active = session.socket;
        socketRef.current = session.socket;
        setSocket(session.socket);
        session.socket.emit("initiative:update", { roomId, board: initiativeRef.current });

        let seenDisplays = "|unset|";
        const applyDisplays = (next: ControlDisplay[]) => {
          const signature = next
            .map(
              (display) =>
                `${display.clientId}:${(display.screens ?? []).map((screen) => screen.id).join(",")}`
            )
            .join("|");
          if (signature === seenDisplays) return;
          seenDisplays = signature;
          setDisplays(next);
          const nextKeys = next.flatMap((display) =>
            (display.screens ?? []).map((screen) => screenKey(display.clientId, screen.id))
          );
          setZones((prev) => assignOpenScreens(prev, nextKeys));
          socketRef.current?.emit("initiative:update", { roomId, board: initiativeRef.current });
          const apps = next.length;
          setStatus(
            nextKeys.length
              ? `${apps} Display Mode app${apps === 1 ? "" : "s"} · ${nextKeys.length} screen${nextKeys.length === 1 ? "" : "s"} · ${pack.saved.length} materials on this device`
              : `Waiting for Display Mode · ${pack.saved.length} materials on this device`
          );
        };

        applyDisplays(session.displays);
        session.socket.on(
          "display:registry",
          (payload: { roomId?: string; displays?: ControlDisplay[] }) => {
            if (!alive || payload.roomId !== roomId) return;
            applyDisplays(payload.displays ?? []);
          }
        );

        let refreshing = false;
        const refreshDisplays = async () => {
          if (!alive || refreshing || !session.socket.connected) return;
          refreshing = true;
          try {
            let listed = await listRoomDisplays(session.socket, roomId);
            if (!alive) return;
            if (!listed.ok) {
              const rejoined = await new Promise<{
                ok?: boolean;
                displays?: ControlDisplay[];
              }>((resolve) => {
                session.socket.emit("room:join", { roomId }, resolve);
              });
              if (!alive || !rejoined.ok) return;
              listed = {
                ok: true,
                displays: rejoined.displays ?? [],
              };
            }
            applyDisplays(listed.displays ?? []);
          } catch {
            // The next poll retries.
          } finally {
            refreshing = false;
          }
        };

        session.socket.on("connect", () => {
          void refreshDisplays();
          const offer = materialOfferRef.current;
          if (offer) void publishMaterialOffer(session.socket, offer);
        });
        void refreshDisplays();
        poll = setInterval(() => void refreshDisplays(), 2000);
        if (!alive) {
          clearInterval(poll);
          leaveControlRoom(session.socket, roomId);
          return;
        }

        if (alive && pack.saved.length > 0) {
          try {
            const shared = await getDisplayApi().publishMaterials({
              roomId,
              materials: pack.saved.map((item) => ({
                id: item.id,
                name: item.name,
                type: item.type,
              })),
            });
            if (!alive) {
              await getDisplayApi().stopSharingMaterials();
              leaveControlRoom(session.socket, roomId);
              return;
            }
            const offer = {
              roomId,
              token: shared.token,
              port: shared.port,
              hosts: shared.hosts,
              materials: shared.materials,
            };
            materialOfferRef.current = offer;
            const offered = await publishMaterialOffer(session.socket, offer);
            if (!offered.ok) {
              pushLog(offered.error || "Could not announce materials to the room");
            }
          } catch (err) {
            pushLog(
              err instanceof Error
                ? err.message
                : "Could not share materials with Display Mode"
            );
          }
        }
        session.socket.on(
          "display:ack",
          (payload: {
            requestId?: string;
            authenticated?: boolean;
            results?: Array<{ screenId: number; authenticated?: boolean }>;
          }) => {
            if (!alive) return;
            const detail = (payload.results ?? [])
              .map(
                (row) =>
                  `screen ${row.screenId} ${row.authenticated ? "authenticated" : "rejected"}`
              )
              .join(", ");
            pushLog(
              `${payload.authenticated ? "Authenticated" : "Rejected"} ${payload.requestId ?? ""} ${detail}`.trim()
            );
          }
        );
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to enter room");
        setStatus("Failed");
      }
    })();

    return () => {
      alive = false;
      if (poll) clearInterval(poll);
      socketRef.current = null;
      leaveControlRoom(active, roomId);
      void getDisplayApi().stopSharingMaterials().catch(() => undefined);
    };
  }, [roomId, campaignId]);

  const screens = useMemo(
    () =>
      displays.flatMap((display) =>
        (display.screens ?? []).map((screen) => ({
          key: screenKey(display.clientId, screen.id),
          label: `Screen ${screen.id}${screen.primary ? " · primary" : ""}`,
          speakerLabel: `Screen ${screen.id} speaker`,
          display,
          screen,
        }))
      ),
    [displays]
  );

  const tags = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of library) {
      if (!belongsInAssetLibrary(item)) continue;
      for (const tag of item.tags) map.set(tag.id, tag.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [library]);

  const visible = library.filter((item) => {
    if (!belongsInAssetLibrary(item)) return false;
    if (!matchesLibraryQuery(item, query)) return false;
    if (tagId && !item.tags.some((tag) => tag.id === tagId)) return false;
    if (kind !== "all" && libraryKind(item) !== kind) return false;
    return true;
  });

  const zone = zones.find((item) => item.number === activeZone) ?? zones[0];
  const editingMap = zoneView === "map";
  const boardLayers = editingMap ? mapScreen.layers : zone.layers;
  const mapMaterials = mapScreen.layers
    .filter((layer) => !layer.hidden)
    .map((layer) => {
      const material = library.find((entry) => entry.id === layer.materialId);
      if (!material) return null;
      const localUrl =
        layer.useCharacterArt && material.characterArtLocalUrl
          ? material.characterArtLocalUrl
          : material.localUrl;
      return {
        ...material,
        id: layer.id,
        localUrl,
        placement: { ...normalizePlacement(layer), ...(layer.flip ? { flip: true } : {}) },
        ...(layer.markText ? { markText: layer.markText } : {}),
        ...(layer.markColor ? { markColor: layer.markColor } : {}),
      };
    })
    .filter((entry): entry is LibraryItem & { placement: MaterialPlacement; markText?: string; markColor?: string } => Boolean(entry));
  function materialsForZone(item: ZoneConfig) {
    return item.layers
      .filter((layer) => !layer.hidden)
      .map((layer) => {
        const material = library.find((entry) => entry.id === layer.materialId);
        if (!material) return null;
        const localUrl =
          layer.useCharacterArt && material.characterArtLocalUrl
            ? material.characterArtLocalUrl
            : material.localUrl;
        return {
          ...material,
          id: layer.id,
          localUrl,
          placement: { ...normalizePlacement(layer), ...(layer.flip ? { flip: true } : {}) },
          ...(layer.markText ? { markText: layer.markText } : {}),
          ...(layer.markColor ? { markColor: layer.markColor } : {}),
        };
      })
      .filter((entry): entry is LibraryItem & { placement: MaterialPlacement; markText?: string; markColor?: string } => Boolean(entry));
  }

  function updateZone(number: ZoneConfig["number"], recipe: (zone: ZoneConfig) => ZoneConfig) {
    setZones((prev) => prev.map((item) => (item.number === number ? recipe(item) : item)));
  }

  function commitZone(next: ZoneConfig, label: string) {
    const nextZones = zones.map((item) => (item.number === next.number ? next : item));
    setZones(nextZones);
    transmit([next], label);
  }

  function applyMark(kind: "text" | "color", value: string) {
    if (!markMenu?.layerId) return;
    if (kind === "text") {
      const word = value.trim();
      if (!word) return;
      patchLayer(markMenu.scope, markMenu.layerId, { markText: word });
      setMarks((current) => rememberText(current, word));
    } else {
      patchLayer(markMenu.scope, markMenu.layerId, { markColor: value });
      setMarks((current) => rememberColor(current, value));
    }
    setMarkMenu(null);
  }

  function togglePortrait(scope: ZoneConfig["number"] | "map", layer: ZoneLayer) {
    const nextArt = layer.useCharacterArt !== true;
    const mapLayerId = scope === "map" ? layer.id : layer.sourceMapLayerId;
    if (mapLayerId) {
      const nextMap = {
        ...mapScreen,
        layers: mapScreen.layers.map((entry) =>
          entry.id === mapLayerId ? { ...entry, useCharacterArt: nextArt } : entry
        ),
      };
      setMapScreen(nextMap);
      const types = new Map(libraryRef.current.map((item) => [item.id, item.type]));
      transmitAssignments(assignmentsForMap(nextMap, types), "NPC portrait");
      return;
    }
    const nextZones = zones.map((zone) =>
      zone.number === scope
        ? {
            ...zone,
            layers: zone.layers.map((entry) =>
              entry.id === layer.id ? { ...entry, useCharacterArt: nextArt } : entry
            ),
          }
        : zone
    );
    setZones(nextZones);
    transmit(
      nextZones.filter((zone) => zone.number === scope),
      "NPC portrait"
    );
  }

  function patchLayer(
    scope: ZoneConfig["number"] | "map",
    layerId: string,
    patch: Partial<ZoneLayer>
  ) {
    const apply = (layer: ZoneLayer): ZoneLayer => {
      const next = { ...layer, ...patch };
      for (const key of Object.keys(patch) as (keyof ZoneLayer)[]) {
        if (patch[key] === undefined) delete next[key];
      }
      return next;
    };
    if (scope === "map") {
      setMapScreen((current) => ({
        ...current,
        layers: current.layers.map((layer) => (layer.id === layerId ? apply(layer) : layer)),
      }));
      return;
    }
    updateZone(scope, (current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === layerId ? apply(layer) : layer)),
    }));
  }

  function placeMaterial(
    scope: ZoneConfig["number"] | "map",
    layerId: string,
    placement: MaterialPlacement
  ) {
    if (scope === "map") {
      setMapScreen((current) => ({
        ...current,
        layers: current.layers.map((layer) => (layer.id === layerId ? { ...layer, ...placement } : layer)),
      }));
      return;
    }
    updateZone(scope, (current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === layerId ? { ...layer, ...placement } : layer)),
    }));
  }

  function addMaterial(materialId: string) {
    if (zoneView === "map") {
      const next = addMapMaterial(mapScreen, materialId);
      setMapScreen(next);
      const added = next.layers[0];
      if (added) setSelectedMaterial({ scope: "map", layerId: added.id });
      return;
    }
    const layers = addLayer(zone.layers, materialId);
    updateZone(activeZone, (current) => ({ ...current, layers }));
    const added = layers[0];
    if (added) setSelectedMaterial({ scope: activeZone, layerId: added.id });
  }

  function selectEnvironmentPack(pack: Combination) {
    setActivePackId(pack.id);
    setError(null);
    setZones((current) => applyEnvironmentPack(current, pack));
    pushLog(`${pack.name} · added to zones 1–4`);
  }

  function quickPlay(item: LibraryItem) {
    const targetKey = item.type.toUpperCase() === "SOUND" ? zone.speakerKey || zone.screenKey : zone.screenKey;
    const target = parseTarget(targetKey);
    if (!target) {
      setError("Connect this zone to a screen before playing");
      return;
    }
    setError(null);
    transmit(
      [
        {
          ...zone,
          layers: [{ id: "quick", materialId: item.id }],
          screenKey: item.type.toUpperCase() === "SOUND" ? "" : targetKey,
          speakerKey: item.type.toUpperCase() === "SOUND" ? targetKey : "",
        },
      ],
      `Quick ${item.name}`
    );
  }

  function moveLayer(scope: ZoneConfig["number"] | "map", layerId: string, direction: -1 | 1) {
    if (scope === "map") {
      setMapScreen((current) => ({ ...current, layers: shiftLayer(current.layers, layerId, direction) }));
      return;
    }
    updateZone(scope, (current) => ({ ...current, layers: shiftLayer(current.layers, layerId, direction) }));
  }

  function onLibraryDrop(payload: string) {
    if (!payload.startsWith("material:")) return;
    addMaterial(payload.slice("material:".length));
  }

  function onLayerDrop(payload: string, targetLayerId: string) {
    if (payload.startsWith("material:")) {
      addMaterial(payload.slice("material:".length));
      return;
    }
    if (!payload.startsWith("layer:")) return;
    const fromId = payload.slice("layer:".length);
    if (zoneView === "map") {
      setMapScreen((current) => ({
        ...current,
        layers: reorderLayers(current.layers, fromId, targetLayerId),
      }));
      return;
    }
    updateZone(activeZone, (current) => ({
      ...current,
      layers: reorderLayers(current.layers, fromId, targetLayerId),
    }));
  }

  if (roomBoot === "loading") {
    return (
      <section className="panel">
        <p className="eyebrow">In room</p>
        <h1>{room?.name || "Room"}</h1>
        <p className="lede">Checking the room…</p>
      </section>
    );
  }

  if (roomBoot === "failed") {
    return (
      <section className="panel">
        <p className="eyebrow">In room</p>
        <h1>{room?.name || "Room"}</h1>
        <p className="error">{error || "Failed to load room"}</p>
      </section>
    );
  }

  if (!campaignId) {
    return (
      <SelectCampaignStep
        roomName={room?.name}
        initialCampaignId={room?.campaignId}
        onBack={() => navigate("/control", { replace: true })}
        onConfirm={async (id) => {
          const updated = await api.updateRoom(roomId, { campaignId: id });
          setRoom(updated);
          setCampaignId(id);
        }}
      />
    );
  }

  return (
    <section className={libraryOpen ? "console library-open" : "console"}>
      <header className="console-head">
        <div className="session-title">
          <h1>{room?.name || "Room"}</h1>
          <p className="muted session-status">
            {room?.campaign?.name || "No campaign"}
            {" · "}
            {status}
            {failedDownloads.length > 0 ? ` · ${failedDownloads.length} download failed` : ""}
          </p>
        </div>
        <div className="screen-pills">
          {screens.map((item) => (
            <ConnectedScreen key={item.key} display={item.display} screen={item.screen} />
          ))}
          {screens.length === 0 ? <span className="muted">No display screens yet</span> : null}
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            leaveControlRoom(socket, roomId);
            socketRef.current = null;
            setSocket(null);
            navigate("/control", { replace: true });
          }}
        >
          Leave room
        </button>
        {error ? <p className="error session-error">{error}</p> : null}
      </header>

      <InitiativePanel board={initiative} onChange={publishInitiative} />

      <aside className="library">
        <div className="library-tabs" role="tablist" aria-label="Library">
          {(
            [
              ["assets", "Assets"],
              ["packs", "Packs"],
              ["bgm", "BGM"],
              ["effects", "Sounds"],
              ["combinations", "Combos"],
              ["settings", "Setting"],
            ] as const
          ).map(([panel, label]) => (
            <button
              key={panel}
              type="button"
              role="tab"
              aria-selected={libraryPanel === panel}
              aria-label={label}
              title={label}
              className={libraryPanel === panel ? "library-tab on" : "library-tab"}
              onClick={() => setLibraryPanel(panel)}
            >
              <LibraryTabIcon panel={panel} />
            </button>
          ))}
        </div>
        <div className="library-head">
        <h2>
          {libraryPanel === "assets"
            ? "Asset library"
            : libraryPanel === "packs"
              ? "Environment packs"
              : libraryPanel === "bgm"
                ? "Background music"
                : libraryPanel === "effects"
                  ? "Sound effects"
                  : libraryPanel === "settings"
                    ? "Setting"
                    : "Combinations"}
        </h2>
        </div>
        <div className="library-body">
        <div hidden={libraryPanel !== "bgm"}>
          <SoundDeck
            materials={library}
            speakerCount={screens.length}
            disabled={!socket}
            onBgm={(materialId, volume, position) => {
              bgmLevelRef.current = volume;
              sendSound("bgm", "play", materialId, volume, position);
            }}
            onPauseBgm={(volume) => {
              bgmLevelRef.current = volume;
              sendSound("bgm", "pause", undefined, volume);
            }}
            onSeekBgm={(position, volume) => {
              bgmLevelRef.current = volume;
              sendSound("bgm", "seek", undefined, volume, position);
            }}
            onStopBgm={(volume) => {
              bgmLevelRef.current = volume;
              sendSound("bgm", "stop", undefined, volume);
            }}
            onVolume={(volume) => {
              bgmLevelRef.current = volume;
              sendSound("bgm", "volume", undefined, volume);
            }}
          />
        </div>
        {libraryPanel === "packs" ? (
          <EnvironmentPackList
            packs={combinations.filter((item) => item.category === "ENVIRONMENT_PACK")}
            library={library}
            query={query}
            activeId={activePackId}
            onQuery={setQuery}
            onSelect={selectEnvironmentPack}
          />
        ) : libraryPanel === "bgm" ? null : libraryPanel === "effects" ? (
          <SoundEffectList
            materials={library}
            disabled={!socket}
            onEffect={(materialId) => sendSound("effect", "play", materialId, 1)}
            onPreview={(materialId) => previewMaterials([materialId])}
          />
        ) : libraryPanel === "combinations" ? (
          <CombinationDeck
            combinations={combinations.filter((item) => item.category !== "ENVIRONMENT_PACK")}
            library={library}
            activeId={activeCombinationId}
            disabled={!socket}
            onPlay={playCombination}
            onPreview={(combination) => previewMaterials(combinationMaterialIds(combination))}
          />
        ) : libraryPanel === "settings" ? (
          <div className="connect-strip">
            {zones.map((item) => (
              <RouteSelects
                key={item.number}
                label={zoneHeading(item.number)}
                screenKey={item.screenKey}
                speakerKey={item.speakerKey}
                screens={screens}
                onScreen={(screenKeyValue) =>
                  commitZone(
                    {
                      ...item,
                      screenKey: screenKeyValue,
                      speakerKey: item.speakerKey || screenKeyValue,
                    },
                    `${zoneHeading(item.number)} → screen`
                  )
                }
                onSpeaker={(speakerKey) =>
                  commitZone({ ...item, speakerKey }, `${zoneHeading(item.number)} → speaker`)
                }
                volume={speakerVolumes[item.speakerKey] ?? 1}
                onVolume={(percent) => changeSpeakerVolume(item.speakerKey, percent)}
              />
            ))}
            <RouteSelects
              label="Map"
              screenKey={mapScreen.screenKey}
              speakerKey={mapScreen.speakerKey}
              screens={screens}
              onScreen={(screenKeyValue) =>
                setMapScreen((current) => ({
                  ...current,
                  screenKey: screenKeyValue,
                  speakerKey: current.speakerKey || screenKeyValue,
                }))
              }
              onSpeaker={(speakerKey) => setMapScreen((current) => ({ ...current, speakerKey }))}
              volume={speakerVolumes[mapScreen.speakerKey] ?? 1}
              onVolume={(percent) => changeSpeakerVolume(mapScreen.speakerKey, percent)}
            />
          </div>
        ) : (
          <>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or tag"
          aria-label="Search materials by name or tag"
        />
        <label>
          Tag
          <select value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <div className="chip-row">
          <button
            type="button"
            className={kind === "all" ? "chip on" : "chip"}
            onClick={() => setKind("all")}
          >
            All
          </button>
          {LIBRARY_KINDS.filter((item) => item !== "sound").map((item) => (
            <button
              key={item}
              type="button"
              className={kind === item ? "chip on" : "chip"}
              onClick={() => setKind(item)}
            >
              {libraryKindLabel(item)}
            </button>
          ))}
        </div>
        <div className="asset-grid tiles">
          {visible.length === 0 ? <p className="muted">No downloaded materials match.</p> : null}
          {visible.map((item) => (
            <article
              key={item.id}
              className="asset-card tile"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", `material:${item.id}`);
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <img className="asset-thumb" src={item.localUrl} alt="" />
              <strong>{item.name}</strong>
              {item.npc ? <span className="asset-npc">NPC</span> : null}
              <div className="asset-actions">
                <button type="button" className="btn tiny" onClick={() => addMaterial(item.id)}>
                  Add
                </button>
                {item.type.toUpperCase() !== "IMAGE" ? (
                  <button type="button" className="btn tiny ghost" onClick={() => quickPlay(item)}>
                    Play
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
          </>
        )}
        </div>
      </aside>

      <div className="zone-board">
        <div className="zone-toolbar">
        <div className="zone-head">
          <h2>Screens</h2>
          <div className="zone-actions">
            {editingMap ? (
              <>
                <button
                  type="button"
                  className={mapScreen.sceneMode ? "btn scene-toggle on" : "btn ghost scene-toggle"}
                  aria-pressed={mapScreen.sceneMode}
                  onClick={() =>
                    setMapScreen((current) => ({
                      ...current,
                      sceneMode: !current.sceneMode,
                      zonesVisible: current.sceneMode ? current.zonesVisible : true,
                    }))
                  }
                >
                  Scene mode
                </button>
                <button
                  type="button"
                  className={mapScreen.zonesVisible ? "btn ghost scene-toggle" : "btn scene-toggle on"}
                  aria-pressed={!mapScreen.zonesVisible}
                  onClick={() => setMapScreen((current) => ({ ...current, zonesVisible: !current.zonesVisible }))}
                >
                  {mapScreen.zonesVisible ? "Hide zones" : "Show zones"}
                </button>
                <button type="button" className="btn" disabled={!socket} onClick={() => transmitMap()}>
                  Send map
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={!socket}
                  onClick={() => transmit([zone], zoneHeading(zone.number))}
                >
                  Send zone {zone.number}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!socket}
                  onClick={() => transmit(zones, "All zones")}
                >
                  Send all
                </button>
              </>
            )}
            <button type="button" className="btn ghost" onClick={() => setLibraryOpen((open) => !open)}>
              {libraryOpen ? "Hide library" : "Show library"}
            </button>
          </div>
          <div className="chip-row" role="group" aria-label="Zone view">
          <button
            type="button"
            className={zoneView === "all" ? "chip on" : "chip"}
            onClick={() => setZoneView("all")}
          >
            All Zones
          </button>
          {zones.map((item) => (
            <button
              key={item.number}
              type="button"
              className={zoneView === item.number ? "chip on" : "chip"}
              onClick={() => {
                setZoneView(item.number);
                setActiveZone(item.number);
              }}
            >
              {zoneHeading(item.number)}
            </button>
          ))}
          <button
            type="button"
            className={zoneView === "map" ? "chip on" : "chip"}
            onClick={() => setZoneView("map")}
          >
            Map
          </button>
        </div>
        </div>
        </div>
        <div className="zone-scroll">
        <div className="stage-layout">
        <div className="stage-main">
        {editingMap ? (
          <MapCanvas
            map={mapScreen}
            materials={mapMaterials}
            selectedId={selectedMaterial?.scope === "map" ? selectedMaterial.layerId : null}
            onSelect={(materialId) =>
              setSelectedMaterial(materialId ? { scope: "map", layerId: materialId } : null)
            }
            onPlacement={(layerId, placement) => {
              setSelectedMaterial({ scope: "map", layerId });
              placeMaterial("map", layerId, placement);
            }}
            onFocus={(col, row) => setMapScreen((current) => ({ ...current, focusCol: col, focusRow: row }))}
            onGridSize={(columns, rows) => setMapScreen((current) => withGridSize(current, columns, rows))}
            onZoom={(next) => setMapScreen((current) => ({ ...current, ...next }))}
            onOpenMark={(layerId, x, y) => setMarkMenu({ scope: "map", layerId, x, y })}
            onOpenMenu={(x, y) => setMarkMenu({ scope: "map", x, y })}
            measureArm={measureArm}
            onMeasureArm={setMeasureArm}
            onZoomLevel={(level) =>
              setMapScreen((current) => ({
                ...current,
                zoom: clampMapZoom(level, current.columns, current.rows),
              }))
            }
            onDropMaterial={addMaterial}
            onSceneLabels={(sceneLabels) => setMapScreen((current) => ({ ...current, sceneLabels }))}
            onSceneCenter={(sceneCenter) => setMapScreen((current) => ({ ...current, sceneCenter }))}
            onMeasure={publishMeasure}
          />
        ) : null}
        {editingMap ? null : (
        <div className={zoneView === "all" ? "zone-grid" : "zone-grid single"}>
          {zones
            .filter((item) => zoneView === "all" || item.number === zoneView)
            .map((item) => (
            <div
              key={item.number}
              className={item.number === activeZone ? "zone-screen on" : "zone-screen"}
              onPointerDown={() => setActiveZone(item.number)}
            >
              <span className="zone-label">{zoneHeading(item.number)}</span>
              <ZonePreview
                materials={materialsForZone(item)}
                selectedId={
                  selectedMaterial?.scope === item.number ? selectedMaterial.layerId : null
                }
                playback={zonePlayback?.zone === item.number ? zonePlayback.materials : undefined}
                playbackToken={zonePlayback?.zone === item.number ? zonePlayback.token : 0}
                playbackAudios={zonePlayback?.zone === item.number ? zonePlayback.audios : undefined}
                onPlaybackEnd={() => {
                  stopPreviewAudio();
                  setZonePlayback((current) => (current?.zone === item.number ? null : current));
                }}
                onStartAudio={
                  zonePlayback?.zone === item.number
                    ? () => startPreviewAudio(zonePlayback.token)
                    : undefined
                }
                onSelect={(layerId) => {
                  setActiveZone(item.number);
                  setSelectedMaterial(layerId ? { scope: item.number, layerId } : null);
                }}
                onPlacement={(layerId, placement) => {
                  setActiveZone(item.number);
                  setSelectedMaterial({ scope: item.number, layerId });
                  placeMaterial(item.number, layerId, placement);
                }}
                onOpenMark={(layerId, x, y) => setMarkMenu({ scope: item.number, layerId, x, y })}
              />
            </div>
          ))}
        </div>
        )}
        </div>
        <aside className="layer-side">
          <h2>{editingMap ? "Map layers" : `${zoneHeading(activeZone)} layers`}</h2>
          <p className="muted">
            {editingMap
              ? "Drag the map to pan. Scroll or the slider to zoom."
              : "Drag to move a material. Corner handles resize it."}
          </p>
        <ol
          className={dragOver ? "layer-list over" : "layer-list"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            onLibraryDrop(event.dataTransfer.getData("text/plain"));
          }}
        >
          {boardLayers.length === 0 ? (
            <li className="muted">Drag materials here. A higher number sits further back.</li>
          ) : null}
          {boardLayers.map((layer, index) => {
            const item = library.find((entry) => entry.id === layer.materialId);
            const scope = editingMap ? "map" : activeZone;
            return (
              <li
                key={layer.id}
                className={[
                  "layer-row",
                  selectedMaterial?.scope === scope && selectedMaterial.layerId === layer.id ? "on" : "",
                  layer.hidden ? "off" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button, input")) return;
                  setSelectedMaterial({ scope, layerId: layer.id });
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragOver(false);
                  onLayerDrop(event.dataTransfer.getData("text/plain"), layer.id);
                }}
              >
                <span className="layer-shift">
                  <button
                    type="button"
                    className="btn tiny ghost icon-btn"
                    aria-label={`Move ${item?.name || "layer"} up`}
                    title="Up"
                    disabled={index === 0}
                    onClick={() => moveLayer(scope, layer.id, -1)}
                  >
                    <ArrowUpIcon />
                  </button>
                  <span
                    className="layer-order"
                    draggable
                    title="Drag to reorder"
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", `layer:${layer.id}`);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="btn tiny ghost icon-btn"
                    aria-label={`Move ${item?.name || "layer"} down`}
                    title="Down"
                    disabled={index === boardLayers.length - 1}
                    onClick={() => moveLayer(scope, layer.id, 1)}
                  >
                    <ArrowDownIcon />
                  </button>
                </span>
                <div className="layer-title">
                <input
                  className="layer-name"
                  aria-label={`Layer ${index + 1} name`}
                  value={layer.name ?? item?.name ?? ""}
                  placeholder={item?.name || "Layer name"}
                  onChange={(event) => patchLayer(scope, layer.id, { name: event.target.value })}
                  onBlur={(event) => {
                    const trimmed = event.target.value.trim();
                    const fallback = item?.name ?? "";
                    patchLayer(scope, layer.id, {
                      name: !trimmed || trimmed === fallback ? undefined : trimmed,
                    });
                  }}
                />
                {layer.markText != null ? (
                  <input
                    className="layer-mark-text"
                    aria-label={`Layer ${index + 1} mark text`}
                    value={layer.markText}
                    maxLength={24}
                    onChange={(event) => patchLayer(scope, layer.id, { markText: event.target.value })}
                    onBlur={(event) => {
                      const word = event.target.value.trim();
                      if (!word) {
                        patchLayer(scope, layer.id, { markText: undefined });
                        return;
                      }
                      patchLayer(scope, layer.id, { markText: word });
                      setMarks((current) => rememberText(current, word));
                    }}
                  />
                ) : null}
                {layer.markColor ? (
                  <button
                    type="button"
                    className="layer-mark-swatch"
                    style={{ background: layer.markColor }}
                    aria-label={`Edit mark color for layer ${index + 1}`}
                    title="Edit mark color"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMarkMenu({
                        scope,
                        layerId: layer.id,
                        x: event.clientX,
                        y: event.clientY,
                        step: "color",
                        color: layer.markColor,
                      });
                    }}
                  />
                ) : null}
                </div>
                <div className="layer-meta">
                <span className="layer-zoom">
                  <button
                    type="button"
                    className="btn tiny ghost"
                    aria-label={`Zoom out ${item?.name || "layer"}`}
                    onClick={() =>
                      placeMaterial(
                        scope,
                        layer.id,
                        zoomPlacement(normalizePlacement(layer), 1 / 1.15)
                      )
                    }
                  >
                    −
                  </button>
                  <span>{Math.round(normalizePlacement(layer).scale * 100)}%</span>
                  <button
                    type="button"
                    className="btn tiny ghost"
                    aria-label={`Zoom in ${item?.name || "layer"}`}
                    onClick={() =>
                      placeMaterial(
                        scope,
                        layer.id,
                        zoomPlacement(normalizePlacement(layer), 1.15)
                      )
                    }
                  >
                    +
                  </button>
                </span>
                <span className="layer-actions">
                  {item?.npc && (item.characterArtUrl || item.characterArtLocalUrl) ? (
                    <button
                      type="button"
                      className={layer.useCharacterArt ? "btn tiny layer-portrait on" : "btn tiny ghost layer-portrait"}
                      aria-pressed={layer.useCharacterArt === true}
                      aria-label={
                        layer.useCharacterArt
                          ? `Show avatar for ${item.name}`
                          : `Show character art for ${item.name}`
                      }
                      title={layer.useCharacterArt ? "立繪" : "頭像"}
                      onClick={() => togglePortrait(scope, layer)}
                    >
                      {layer.useCharacterArt ? "立繪" : "頭像"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={layer.flip ? "btn tiny ghost icon-btn on" : "btn tiny ghost icon-btn"}
                    aria-label={`Flip ${item?.name || "layer"}`}
                    aria-pressed={layer.flip === true}
                    title="Flip"
                    onClick={() => patchLayer(scope, layer.id, { flip: !layer.flip })}
                  >
                    <FlipIcon />
                  </button>
                  <button
                    type="button"
                    className="btn tiny ghost icon-btn"
                    aria-label={layer.hidden ? `Show ${item?.name || "layer"}` : `Hide ${item?.name || "layer"}`}
                    onClick={() => patchLayer(scope, layer.id, { hidden: !layer.hidden })}
                  >
                    {layer.hidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                  <button
                    type="button"
                    className="btn tiny ghost icon-btn"
                    aria-label={`Remove ${item?.name || "layer"}`}
                    onClick={() => {
                      if (scope === "map") {
                        setMapScreen((current) => ({
                          ...current,
                          layers: current.layers.filter((entry) => entry.id !== layer.id),
                        }));
                      } else {
                        updateZone(activeZone, (current) => ({
                          ...current,
                          layers: current.layers.filter((entry) => entry.id !== layer.id),
                        }));
                      }
                      setSelectedMaterial((current) =>
                        current?.scope === scope && current.layerId === layer.id ? null : current
                      );
                    }}
                  >
                    <TrashIcon />
                  </button>
                </span>
                </div>
              </li>
            );
          })}
        </ol>
        </aside>
        </div>

        <div className="log-block">
          <button type="button" className="btn tiny ghost" onClick={() => setLogOpen((open) => !open)}>
            {logOpen ? "Hide commands debug log" : "Show commands debug log"}
          </button>
          {logOpen ? (
            <>
              {log.length === 0 ? <p className="muted">No commands sent yet.</p> : null}
              {log.map((line) => (
                <p key={line.id}>{line.text}</p>
              ))}
            </>
          ) : null}
        </div>
        </div>
      </div>
      {markMenu ? (
        <MaterialMarkMenu
          key={`${markMenu.scope}:${markMenu.layerId ?? ""}:${markMenu.step ?? "root"}:${markMenu.x}:${markMenu.y}`}
          x={markMenu.x}
          y={markMenu.y}
          texts={marks.texts}
          colors={marks.colors}
          initialStep={markMenu.step ?? "root"}
          initialColor={markMenu.color}
          showMark={markMenu.layerId != null}
          onText={(text) => applyMark("text", text)}
          onColor={(color) => applyMark("color", color)}
          onMeasureMode={markMenu.scope === "map" ? (mode) => setMeasureArm(mode) : undefined}
          onClose={() => setMarkMenu(null)}
        />
      ) : null}
    </section>
  );
}

function LibraryTabIcon({
  panel,
}: {
  panel: "assets" | "packs" | "bgm" | "effects" | "combinations" | "settings";
}) {
  if (panel === "assets") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5 19 7.5v9L12 20.5 5 16.5v-9L12 3.5z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 12.2 19 7.5M12 12.2v8.3M12 12.2 5 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (panel === "packs") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 18.5 9.2 10l3.1 3.6L15.2 9 21 18.5H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M16.2 10.2 18 7.2l1.8 3M18 10.2v2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  if (panel === "bgm") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 17.5V7.2L19 5v10.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="17.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="17" cy="15.2" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (panel === "effects") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10h3.2L11 6.5v11L7.2 14H4V10z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M14.2 9.2a3.6 3.6 0 0 1 0 5.6M16.6 7a6.4 6.4 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (panel === "combinations") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="13" width="14" height="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="6.6" y="8.2" width="10.8" height="4.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 8.2v11M9.2 8.2c0-1.6 1.2-2.6 2.8-2.6s2.8 1 2.8 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 13.4a7.8 7.8 0 0 0 .1-1.4 7.8 7.8 0 0 0-.1-1.4l1.8-1.4-1.8-3.2-2.2.9a7.6 7.6 0 0 0-2.4-1.4L14.4 2.8h-4.8l-.4 2.7a7.6 7.6 0 0 0-2.4 1.4l-2.2-.9-1.8 3.2 1.8 1.4a7.8 7.8 0 0 0-.1 1.4 7.8 7.8 0 0 0 .1 1.4l-1.8 1.4 1.8 3.2 2.2-.9a7.6 7.6 0 0 0 2.4 1.4l.4 2.7h4.8l.4-2.7a7.6 7.6 0 0 0 2.4-1.4l2.2.9 1.8-3.2-1.8-1.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 8.5 3.5 12l4 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 8.5 20.5 12l-4 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-4.1 4.6M6.1 6.7C3.5 8.6 2 12 2 12a18 18 0 0 0 6.2 5.4 10 10 0 0 0 4.3 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  ChevronRight,
  Circle,
  Clock,
  Folder,
  FolderPlus,
  ImagePlus,
  Trash2,
  ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  Square,
  SquarePen,
  X,
} from 'lucide-react';
import {
  AcpChatMessage,
  AcpPlanEntry,
  AcpStatusInfo,
  AcpToolCallEvent,
  AgentConversationSummary,
  ReferenceImageRecord,
} from '../types/robotics';
import { timeAgo } from '../utils/timeAgo';
import { AnalyzedImageFeatures } from '../utils/imageTo3DAnalyzer';
import {
  collectDrop,
  EvidenceFolder,
  evidenceKind,
  foldersFromInput,
  PickedFolder,
  uploadEvidenceFolder,
} from '../utils/evidenceFiles';
import {
  AGENT_COLOR,
  Button,
  IconButton,
  ImageViewer,
  ImageViewerItem,
  Markdown,
  MenuItem,
  PopoverMenu,
  Tooltip,
} from '../design-system';

interface AcpStudioPanelProps {
  acpStatus: AcpStatusInfo;
  messages: AcpChatMessage[];
  isBusy: boolean;
  /** Short stage label from the agent ("Blocking out the body") */
  status: string;
  /** True when the last run changed the scene and can be reverted */
  canRevert: boolean;
  /** Increments when another part of the app asks to open the file picker */
  attachRequest?: number;
  /** Overall model height sent with each message (Settings → Agent); 0 lets the agent estimate it */
  targetHeightMm?: number;
  onReconnectAcp: (command?: string) => Promise<void>;
  onUploadImage: (file: File) => Promise<{ record: ReferenceImageRecord; features: AnalyzedImageFeatures }>;
  /** While the agent works, this steers the run in progress */
  onSend: (params: {
    text: string;
    images?: ReferenceImageRecord[];
    folders?: EvidenceFolder[];
    targetHeightMm?: number;
  }) => Promise<void>;
  onStop: () => void;
  onNewChat: () => void;
  onRevert: () => void;
  chats: AgentConversationSummary[];
  currentChatId: string | null;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

/** Images sent inline with one message; more (and other files) go in as evidence */
const MAX_IMAGES = 20;

/** An attached folder while it copies, then ready to send */
interface FolderChip extends Partial<EvidenceFolder> {
  key: string;
  name: string;
  done: number;
  total: number;
  ready: boolean;
}

type ViewerState = { images: ImageViewerItem[]; index: number } | null;

// Composer placeholders: short examples that cycle while the composer is empty
const EXAMPLES = {
  idle: ['Desk lamp arm', 'Pan–tilt camera mount', 'Gripper for an STS3215', 'Four-wheel rover', 'Hexapod leg'],
  attached: ['Open Duck Mini, 40 cm tall', 'Match the photos', 'Just the head', 'Half scale'],
  busy: ['Longer legs', 'Thicker brackets', 'Round the edges', 'Use M3 screws'],
};
const EXAMPLE_INTERVAL_MS = 3600;

export const AcpStudioPanel: React.FC<AcpStudioPanelProps> = ({
  acpStatus,
  messages,
  isBusy,
  status,
  canRevert,
  attachRequest = 0,
  targetHeightMm = 0,
  onReconnectAcp,
  onUploadImage,
  onSend,
  onStop,
  onNewChat,
  onRevert,
  chats,
  currentChatId,
  onOpenChat,
  onDeleteChat,
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedContentRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

  const [attachedImages, setAttachedImages] = useState<ReferenceImageRecord[]>([]);
  const [attachedFolders, setAttachedFolders] = useState<FolderChip[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0 || attachedFolders.some((f) => !f.ready);
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [viewer, setViewer] = useState<ViewerState>(null);

  const isClaude = /claude-(agent|code)-acp/.test(acpStatus.agentCommand);

  // Open the picker when asked from elsewhere (e.g. Library → From Image…)
  const lastAttachRequest = useRef(attachRequest);
  useEffect(() => {
    if (attachRequest !== lastAttachRequest.current) {
      lastAttachRequest.current = attachRequest;
      fileInputRef.current?.click();
    }
  }, [attachRequest]);

  /* ---------------- Follow the newest activity ---------------- */

  // Follows the bottom until the user scrolls up; scrolling back to the bottom resumes it
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const distanceFromBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight;

  // Soft fades at the edges that still have content to scroll to
  const [edgeFade, setEdgeFade] = useState({ top: false, bottom: false });
  const updateEdgeFade = (el: HTMLElement) => {
    const top = el.scrollTop > 1;
    const bottom = distanceFromBottom(el) > 1;
    setEdgeFade((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }));
  };

  const unstick = () => {
    const el = feedRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    stickRef.current = false;
  };

  const scrollToBottom = (smooth = false) => {
    const el = feedRef.current;
    stickRef.current = true;
    setShowJump(false);
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
    updateEdgeFade(el);
  }, [messages, status]);

  const exampleSet = isBusy ? 'busy' : attachedImages.length || attachedFolders.length ? 'attached' : 'idle';

  // Content also grows on its own (thoughts expanding, images loading)
  const isEmpty = messages.length === 0;
  useEffect(() => {
    const el = feedRef.current;
    const content = feedContentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
      updateEdgeFade(el);
    });
    observer.observe(content);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isEmpty]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [promptText]);

  /* ---------------- Attachments ---------------- */

  const uploadFolders = async (folders: PickedFolder[]) => {
    const chips = folders
      .filter((f) => f.files.length)
      .map((f) => ({ key: `${f.name}-${Date.now()}-${Math.random()}`, name: f.name, done: 0, total: f.files.length, ready: false, folder: f }));
    if (!chips.length) return;
    setAttachedFolders((prev) => [...prev, ...chips.map(({ folder: _f, ...c }) => c)]);
    await Promise.all(
      chips.map(async ({ key, folder }) => {
        try {
          const result = await uploadEvidenceFolder(folder, (done, total) =>
            setAttachedFolders((prev) => prev.map((c) => (c.key === key ? { ...c, done, total } : c)))
          );
          setAttachedFolders((prev) =>
            result.fileCount
              ? prev.map((c) => (c.key === key ? { ...c, ...result, ready: true } : c))
              : prev.filter((c) => c.key !== key)
          );
        } catch {
          setAttachedFolders((prev) => prev.filter((c) => c.key !== key));
        }
      })
    );
    textareaRef.current?.focus();
  };

  /** Images go inline (up to MAX_IMAGES); extra images and other readable files go in as evidence */
  const attachFiles = async (files: File[], folders: PickedFolder[] = []) => {
    const images = files.filter((f) => f.type.startsWith('image/') && evidenceKind(f) === 'image');
    const inline = images.slice(0, Math.max(0, MAX_IMAGES - attachedImages.length - uploadingCount));
    const rest = files.filter((f) => !inline.includes(f) && evidenceKind(f));
    const extra = rest.length ? [{ name: 'Attached files', files: rest.map((file) => ({ file, relPath: file.name })) }] : [];
    const work: Promise<unknown>[] = [uploadFolders([...folders, ...extra])];
    if (inline.length) {
      setUploadingCount((n) => n + inline.length);
      work.push(
        // Keep the order they were picked in
        Promise.all(inline.map((file) => onUploadImage(file).then(({ record }) => record, () => null))).then((records) => {
          setUploadingCount((n) => n - inline.length);
          setAttachedImages((prev) => [...prev, ...records.filter((r): r is ReferenceImageRecord => !!r)]);
        })
      );
    }
    await Promise.all(work);
    textareaRef.current?.focus();
  };

  const hasDraft = !!promptText.trim() || attachedImages.length > 0 || attachedFolders.length > 0;
  const canSend = !isUploading && hasDraft;

  const submit = async () => {
    if (!canSend) return;
    const text = promptText.trim();
    const images = attachedImages;
    const folders = attachedFolders
      .filter((f) => f.ready && f.id)
      .map((f) => ({ id: f.id!, name: f.name, fileCount: f.fileCount ?? 0, imageCount: f.imageCount ?? 0, skipped: f.skipped ?? 0 }));
    setPromptText('');
    setAttachedImages([]);
    setAttachedFolders([]);
    scrollToBottom();
    await onSend({ text, images, folders, targetHeightMm: targetHeightMm || undefined });
  };

  const last = messages[messages.length - 1];
  const lastAgentId = [...messages].reverse().find((m) => m.role === 'agent')?.id;

  return (
    <div
      className="relative flex flex-col h-full min-h-0 min-w-0"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        collectDrop(e.dataTransfer).then(({ loose, folders }) => attachFiles(loose, folders));
      }}
    >
      {!acpStatus.connected && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-amber-500/10 text-[13px] text-amber-200/90 flex items-center gap-2">
          <span className="flex-1 min-w-0 break-words">{acpStatus.error ? `Agent error: ${acpStatus.error}` : 'Agent isn’t connected.'}</span>
          <button
            type="button"
            onClick={() => onReconnectAcp(acpStatus.agentCommand)}
            className="h-7 px-2.5 rounded-lg text-[12.5px] font-medium text-amber-100 hover:bg-amber-500/15 cursor-default shrink-0"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Feed */}
      <div className="relative flex-1 min-h-0">
          <div className="absolute top-2.5 right-3 z-10" ref={historyRef}>
            <IconButton
              icon={<Clock className="w-4 h-4" />}
              title="History"
              size="sm"
              className="rounded-full bg-[#1d1d21] ring-1 ring-inset ring-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
              isToggled={historyOpen}
              onClick={() => setHistoryOpen((v) => !v)}
            />
            <PopoverMenu
              isOpen={historyOpen}
              onClose={() => setHistoryOpen(false)}
              ignoreRef={historyRef}
              position="bottom"
              align="end"
              className="w-[300px] max-h-[420px] overflow-y-auto overflow-x-hidden"
            >
              {chats.length === 0 ? (
                <div className="px-3 py-6 text-center text-[13px] text-white/45">No chats</div>
              ) : (
                chats.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-1 min-w-0 rounded-lg ${c.id === currentChatId ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'}`}
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setHistoryOpen(false);
                        onOpenChat(c.id);
                      }}
                      className="flex-1 min-w-0 text-left px-2.5 py-2 cursor-default disabled:opacity-40"
                    >
                      <div className="text-[13px] text-white/90 truncate">{c.title}</div>
                      <div className="text-[12px] text-white/40">{timeAgo(c.updatedAt)}</div>
                    </button>
                    <IconButton
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      title="Delete chat"
                      size="xs"
                      variant="danger"
                      className="opacity-0 group-hover:opacity-100 mr-1 shrink-0"
                      onClick={() => onDeleteChat(c.id)}
                    />
                  </div>
                ))
              )}
            </PopoverMenu>
          </div>
        <div
          ref={feedRef}
          className="h-full overflow-y-auto overflow-x-hidden px-4 pt-14 pb-4"
          style={{
            maskImage: feedMask(edgeFade),
            WebkitMaskImage: feedMask(edgeFade),
          }}
          onWheel={(e) => {
            if (e.deltaY >= 0) return;
            // Scrolling a nested scroller (code) doesn't count until it reaches its top
            const inner = (e.target as HTMLElement).closest('[data-inner-scroll]');
            if (inner && inner.scrollTop > 0) return;
            unstick();
          }}
          onKeyDown={(e) => {
            if (['ArrowUp', 'PageUp', 'Home'].includes(e.key) || (e.key === ' ' && e.shiftKey)) unstick();
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            // Back at the very bottom: follow again
            if (distanceFromBottom(el) < 4) stickRef.current = true;
            // Dragging the overlay scrollbar (OverlayScrollbars) stops the follow
            else if ('scrollbarDrag' in el.dataset) unstick();
            setShowJump(!stickRef.current && distanceFromBottom(el) > 80);
            updateEdgeFade(el);
          }}
        >
          {messages.length === 0 ? (
            <div ref={feedContentRef} />
          ) : (
            <div ref={feedContentRef} className="space-y-5 min-w-0">
              {messages.map((msg) =>
                msg.role === 'user' ? (
                  <UserMessage key={msg.id} msg={msg} onOpenImages={(images, index) => setViewer({ images, index })} />
                ) : (
                  <AgentMessage
                    key={msg.id}
                    msg={msg}
                    busy={isBusy && msg.id === lastAgentId}
                    status={status}
                    onOpenImages={(images, index) => setViewer({ images, index })}
                  />
                )
              )}
              {!isBusy && canRevert && last?.role === 'agent' && (
                <div className="-mt-2">
                  <Button size="xs" variant="ghost" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={onRevert}>
                    Revert Changes
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {showJump && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-pop-up">
            <Tooltip label="Scroll to bottom" side="top">
              <button
                type="button"
                aria-label="Scroll to bottom"
                onClick={() => scrollToBottom(true)}
                className="w-8 h-8 rounded-full bg-[#2a2a2f] ring-1 ring-white/[0.1] shadow-[0_4px_14px_rgba(0,0,0,0.45)] text-white/80 hover:text-white hover:bg-[#323238] flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.94]"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <div className="rounded-[20px] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] focus-within:ring-white/[0.16] focus-within:bg-white/[0.06] transition-colors">
          {(attachedImages.length > 0 || attachedFolders.length > 0 || uploadingCount > 0) && (
            <div className="px-2.5 pt-2.5 flex flex-wrap gap-2 max-h-[164px] overflow-y-auto overflow-x-hidden">
              {attachedFolders.map((f) => (
                <div key={f.key} className="relative animate-pop-up min-w-0 max-w-full">
                  <div className="h-14 max-w-[220px] pl-2.5 pr-3.5 rounded-xl bg-white/[0.06] ring-1 ring-white/10 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center shrink-0">
                      {f.ready ? <Folder className="w-4 h-4 text-white/75" /> : <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-white/90 truncate">{f.name}</span>
                      <span className="block text-[12px] text-white/45 tabular truncate">
                        {f.ready
                          ? `${f.fileCount} file${f.fileCount === 1 ? '' : 's'}${f.skipped ? ` · ${f.skipped} skipped` : ''}`
                          : `${f.done} of ${f.total}`}
                      </span>
                    </span>
                  </div>
                  <RemoveChip label={`Remove ${f.name}`} onClick={() => setAttachedFolders((prev) => prev.filter((p) => p.key !== f.key))} />
                </div>
              ))}
              {attachedImages.map((img, i) => (
                <div key={img.id} className="relative animate-pop-up">
                  <Tooltip label={img.name} side="top">
                    <button
                      type="button"
                      aria-label={`View ${img.name}`}
                      onClick={() => setViewer({ images: attachedImages.map((a) => ({ src: a.dataUrl, name: a.name })), index: i })}
                      className="block w-14 h-14 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10 cursor-zoom-in transition-transform duration-150 active:scale-[0.96]"
                    >
                      <img src={img.dataUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  </Tooltip>
                  <RemoveChip label={`Remove ${img.name}`} onClick={() => setAttachedImages((prev) => prev.filter((p) => p.id !== img.id))} />
                </div>
              ))}
              {Array.from({ length: uploadingCount }).map((_, i) => (
                <span key={`up-${i}`} className="w-14 h-14 rounded-xl bg-white/[0.06] flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) => evidenceKind(f));
                if (files.length) {
                  e.preventDefault();
                  attachFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                } else if (e.key === 'Escape' && isBusy && !hasDraft) {
                  e.preventDefault();
                  onStop();
                }
              }}
              aria-label={`Message ${isClaude ? 'Claude' : 'the agent'}`}
              className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-relaxed text-white/95 outline-none"
            />
            {!promptText && (
              <CyclingPlaceholder
                // A new set of examples starts from its first
                key={exampleSet}
                examples={EXAMPLES[exampleSet]}
              />
            )}
          </div>

          <div className="flex items-center gap-1 px-2 pb-2">
            <div className="relative" ref={attachMenuRef}>
              <IconButton
                icon={<Plus className="w-[18px] h-[18px]" />}
                title="Attach"
                tooltipSide="top"
                size="sm"
                className="rounded-full"
                isToggled={attachMenuOpen}
                onClick={() => setAttachMenuOpen((v) => !v)}
              />
              <PopoverMenu
                isOpen={attachMenuOpen}
                onClose={() => setAttachMenuOpen(false)}
                ignoreRef={attachMenuRef}
                align="start"
                className="w-56"
              >
                <MenuItem
                  icon={<ImagePlus className="w-4 h-4" />}
                  label="Attach Images…"
                  onSelect={() => {
                    setAttachMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                />
                <MenuItem
                  icon={<FolderPlus className="w-4 h-4" />}
                  label="Attach Folder…"
                  onSelect={() => {
                    setAttachMenuOpen(false);
                    folderInputRef.current?.click();
                  }}
                />
              </PopoverMenu>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                await attachFiles(files);
              }}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                await uploadFolders(foldersFromInput(files));
              }}
              className="hidden"
            />

            <IconButton
              icon={<SquarePen className="w-4 h-4" />}
              title="New chat"
              tooltipSide="top"
              size="sm"
              className="rounded-full"
              disabled={isBusy}
              onClick={onNewChat}
            />

            <div className="flex-1" />

            {isBusy && (
              <Tooltip label="Stop" shortcut="Esc" side="top">
                <button
                  type="button"
                  aria-label="Stop"
                  onClick={onStop}
                  className={`w-8 h-8 rounded-full flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.92] ${
                    hasDraft ? 'bg-white/[0.1] text-white/85 hover:bg-white/[0.16]' : 'bg-white text-black hover:bg-white/90'
                  }`}
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              </Tooltip>
            )}
            {(!isBusy || hasDraft) && (
              <Tooltip label={isBusy ? 'Send now' : 'Send'} shortcut="↩︎" side="top">
                <button
                  type="button"
                  aria-label={isBusy ? 'Send now' : 'Send'}
                  onClick={submit}
                  disabled={!canSend}
                  className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.92] hover:bg-white/90 disabled:bg-white/15 disabled:text-white/40 disabled:active:scale-100"
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {isDragOver && (
        <div className="absolute inset-2 rounded-2xl border-2 border-dashed border-[#0d99ff]/70 bg-[#0d99ff]/[0.06] flex flex-col items-center justify-center gap-2 pointer-events-none animate-fade-in">
          <ImageIcon className="w-6 h-6 text-[#5cb8ff]" />
          <span className="text-[14px] text-white/80">Drop images, files or folders to attach</span>
        </div>
      )}

      <ImageViewer
        images={viewer?.images ?? []}
        index={viewer?.index ?? null}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
        onClose={() => setViewer(null)}
      />
    </div>
  );
};

/** Mask for the feed: fade an edge only when there's more to scroll to past it */
const FEED_FADE_PX = 28;
function feedMask({ top, bottom }: { top: boolean; bottom: boolean }) {
  if (!top && !bottom) return undefined;
  const start = top ? `transparent 0, #000 ${FEED_FADE_PX}px` : '#000 0';
  const end = bottom ? `#000 calc(100% - ${FEED_FADE_PX}px), transparent 100%` : '#000 100%';
  return `linear-gradient(to bottom, ${start}, ${end})`;
}

const RemoveChip: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#3a3a3a] ring-2 ring-[#1f1f1f] text-white/80 hover:text-white flex items-center justify-center cursor-default"
  >
    <X className="w-3 h-3" strokeWidth={2.5} />
  </button>
);

/* ------------------------------------------------------------------ */
/* User message                                                        */
/* ------------------------------------------------------------------ */

/** Collapsed height of a long message (about 9 lines) */
const COLLAPSED_PX = 212;

const UserMessage: React.FC<{ msg: AcpChatMessage; onOpenImages: (images: ImageViewerItem[], index: number) => void }> = ({
  msg,
  onOpenImages,
}) => {
  const images = msg.imageAttachments ?? (msg.imageAttachment ? [msg.imageAttachment] : []);
  const folders = msg.folderAttachments ?? [];
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => setLong(el.scrollHeight > COLLAPSED_PX + 24);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [msg.text]);

  const clamp = long && !expanded;
  const fade = clamp ? 'linear-gradient(to bottom, #000 calc(100% - 48px), transparent)' : undefined;

  return (
    <div className="flex flex-col items-end gap-1 animate-fade-in min-w-0">
      <div className={`max-w-[85%] min-w-0 rounded-[18px] bg-white/[0.08] px-3.5 py-2.5 space-y-2 ${msg.queued || msg.notSent ? 'opacity-60' : ''}`}>
        {images.length > 0 && (
          <div className={`grid gap-1.5 ${images.length > 1 ? 'grid-cols-2' : ''} ${images.length > 4 ? 'sm:grid-cols-3' : ''}`}>
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                aria-label={`View image ${i + 1}`}
                onClick={() => onOpenImages(images.map((s, n) => ({ src: s, name: `Image ${n + 1}` })), i)}
                className="block rounded-xl overflow-hidden bg-black/30 cursor-zoom-in transition-transform duration-150 active:scale-[0.97]"
              >
                <img src={src} alt="" className={`w-full object-contain ${images.length > 1 ? 'aspect-square object-cover' : 'max-h-44'}`} />
              </button>
            ))}
          </div>
        )}
        {folders.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {folders.map((f) => (
              <span key={f.id} className="h-8 max-w-full px-2.5 rounded-lg bg-white/[0.06] flex items-center gap-1.5 min-w-0">
                <Folder className="w-3.5 h-3.5 text-white/60 shrink-0" />
                <span className="text-[13px] text-white/85 truncate">{f.name}</span>
                <span className="text-[12px] text-white/45 tabular shrink-0">{f.fileCount}</span>
              </span>
            ))}
          </div>
        )}
        {msg.text && (
          <div>
            <p
              ref={textRef}
              className="text-[14px] text-white/90 whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed select-text overflow-hidden"
              style={{ maxHeight: clamp ? COLLAPSED_PX : undefined, maskImage: fade, WebkitMaskImage: fade }}
            >
              {msg.text}
            </p>
            {long && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 -ml-1 h-7 px-1.5 rounded-md text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] cursor-default transition-colors"
              >
                {expanded ? 'Show Less' : 'Show More'}
              </button>
            )}
          </div>
        )}
      </div>
      {(msg.queued || msg.notSent) && (
        <span className="text-[12px] text-white/40 pr-1">{msg.queued ? 'Sends after this run' : 'Not sent'}</span>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Agent reply                                                         */
/* ------------------------------------------------------------------ */

const AgentMessage: React.FC<{
  msg: AcpChatMessage;
  busy: boolean;
  status: string;
  onOpenImages: (images: ImageViewerItem[], index: number) => void;
}> = ({ msg, busy, status, onOpenImages }) => {
  const text = msg.text.replace(/\[MODEL_CREATED:[^\]]+\]/g, '').trim();
  const calls = new Map((msg.toolCalls ?? []).map((tc) => [tc.toolCallId, tc]));
  // Older saved chats have no segments: rebuild a simple order
  const segments =
    msg.segments ??
    [
      ...(msg.thought ? [{ type: 'thought' as const, text: msg.thought }] : []),
      ...(msg.toolCalls ?? []).map((tc) => ({ type: 'tool' as const, toolCallId: tc.toolCallId })),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ];
  const last = segments[segments.length - 1];

  return (
    <div className="space-y-2.5 animate-fade-in min-w-0">
      {msg.plan && msg.plan.length > 0 && <PlanCard entries={msg.plan} />}

      {segments.map((seg, i) => {
        if (!('toolCallId' in seg)) {
          if (seg.type === 'thought') return <ThoughtBlock key={i} text={seg.text} live={busy && seg === last} />;
          const t = seg.text.replace(/\[MODEL_CREATED:[^\]]+\]/g, '').trim();
          return t ? <Markdown key={i}>{t}</Markdown> : null;
        }
        const tc = calls.get(seg.toolCallId);
        const label = tc ? toolLabel(tc) : null;
        return tc && label ? <ToolStep key={i} call={tc} label={label.title} detail={label.detail} onOpenImages={onOpenImages} /> : null;
      })}

      {/* A live thought already says "Thinking" in its own header */}
      {busy && (status || last?.type !== 'thought') && (
        <div className="flex items-center gap-2 h-6 text-[13.5px]">
          <span className="bg-[linear-gradient(90deg,rgba(255,255,255,0.35),rgba(255,255,255,0.9),rgba(255,255,255,0.35))] bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
            {status || (segments.length ? 'Working…' : 'Thinking…')}
          </span>
        </div>
      )}
      {msg.stopped && <div className="text-[12.5px] text-white/40">Stopped</div>}
    </div>
  );
};

/**
 * Reasoning summary. While it streams it's open in a short window that shows the newest
 * lines under a soft top fade. Once done it folds to "Thought", which expands to the full
 * text inline. It never scrolls on its own, so the wheel always scrolls the conversation.
 */
const ThoughtBlock: React.FC<{ text: string; live: boolean }> = ({ text, live }) => {
  // null until the user toggles it: open while live, folded once done
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? live;
  const [clipped, setClipped] = useState(false);
  const windowRef = useRef<HTMLDivElement | null>(null);

  // Keep the live window on the newest line
  useLayoutEffect(() => {
    const el = windowRef.current;
    if (!el || !live) return;
    el.scrollTop = el.scrollHeight;
    setClipped(el.scrollHeight > el.clientHeight + 2);
  }, [text, live, open]);

  const fade = live && clipped
    ? 'linear-gradient(to bottom, transparent 0, #000 36px, #000 100%)'
    : undefined;

  return (
    <div className="animate-fade-in min-w-0">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="group/thought h-7 -ml-1 pl-1 pr-2 rounded-md flex items-center gap-2 text-[13px] text-white/45 hover:text-white/80 hover:bg-white/[0.04] cursor-default transition-colors"
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          <Brain className="w-3.5 h-3.5" strokeWidth={2} />
        </span>
        {live ? (
          <span className="bg-[linear-gradient(90deg,rgba(255,255,255,0.35),rgba(255,255,255,0.85),rgba(255,255,255,0.35))] bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
            Thinking
          </span>
        ) : (
          <span>Thought</span>
        )}
        <ChevronRight
          className={`-ml-1 w-3.5 h-3.5 opacity-60 group-hover/thought:opacity-100 transition-[transform,opacity] duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)] ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            ref={windowRef}
            className={`pl-6 pr-1 ${live ? 'max-h-[132px] overflow-hidden' : ''}`}
            style={{ maskImage: fade, WebkitMaskImage: fade }}
          >
            <p className="text-[13px] leading-[21px] text-white/50 whitespace-pre-wrap [overflow-wrap:anywhere] select-text pt-0.5 pb-1">
              {text.trim()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const PlanCard: React.FC<{ entries: AcpPlanEntry[] }> = ({ entries }) => {
  const done = entries.filter((e) => e.status === 'completed').length;
  return (
    <div className="rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12.5px] font-medium text-white/70">Plan</span>
        <span className="text-[12px] text-white/40 tabular">
          {done}/{entries.length}
        </span>
      </div>
      <ul className="space-y-1">
        {entries.map((e, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
            <span className="mt-[3px] w-3.5 h-3.5 shrink-0 flex items-center justify-center">
              {e.status === 'completed' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
              ) : e.status === 'in_progress' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: AGENT_COLOR }} />
              ) : (
                <Circle className="w-3 h-3 text-white/25" />
              )}
            </span>
            <span className={`min-w-0 break-words ${e.status === 'completed' ? 'text-white/45' : e.status === 'in_progress' ? 'text-white' : 'text-white/70'}`}>
              {e.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ToolStep: React.FC<{
  call: AcpToolCallEvent;
  label: string;
  detail?: string;
  onOpenImages: (images: ImageViewerItem[], index: number) => void;
}> = ({ call, label, detail, onOpenImages }) => {
  const [open, setOpen] = useState(false);
  const input = (call.rawInput ?? {}) as { code?: string; language?: string; urls?: unknown };
  const code = typeof input.code === 'string' ? input.code : null;
  // Web images the agent looked at
  const urls = /view_image/.test(`${call.toolName ?? ''} ${call.title ?? ''}`) && Array.isArray(input.urls)
    ? (input.urls as unknown[]).filter((u): u is string => typeof u === 'string')
    : [];
  const expandable = !!code || urls.length > 0;
  const status = call.status;
  return (
    <div className="min-w-0">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-7 flex items-start gap-2 py-1 text-left text-[13px] cursor-default rounded-md enabled:hover:bg-white/[0.03]"
      >
        <span className="mt-[2px] w-4 h-4 flex items-center justify-center shrink-0">
          {status === 'completed' ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
          ) : status === 'failed' ? (
            <X className="w-3.5 h-3.5 text-red-400" strokeWidth={2.5} />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: AGENT_COLOR }} />
          )}
        </span>
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
          <span className="text-white/75">{label}</span>
          {detail && <span className="text-white/40"> · {detail}</span>}
        </span>
        {expandable && (
          <ChevronRight className={`mt-[3px] w-3.5 h-3.5 text-white/30 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        )}
      </button>
      {open && code && (
        <pre
          data-inner-scroll
          className="ml-6 mt-1 mb-1 p-3 rounded-xl bg-black/30 ring-1 ring-inset ring-white/[0.06] max-h-72 overflow-auto text-[12px] leading-relaxed font-mono text-white/75 select-text animate-fade-in"
        >
          {code}
        </pre>
      )}
      {open && urls.length > 0 && (
        <div className="ml-6 mt-1 mb-1 grid grid-cols-2 gap-1.5 animate-fade-in">
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              aria-label={`View ${u}`}
              onClick={() => onOpenImages(urls.map((src) => ({ src, name: src.split('/').pop()?.split('?')[0] || src })), i)}
              className="block aspect-[4/3] rounded-lg overflow-hidden bg-black/30 ring-1 ring-inset ring-white/[0.06] cursor-zoom-in"
            >
              <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Plain-language labels for the agent's tool calls; null hides the step */
function toolLabel(tc: AcpToolCallEvent): { title: string; detail?: string } | null {
  const name = `${tc.toolName ?? ''} ${tc.title ?? ''}`.toLowerCase();
  const input = (tc.rawInput ?? {}) as Record<string, unknown>;
  const done = tc.status === 'completed';
  const verb = (ing: string, ed: string) => (done ? ed : ing);
  const list = (arr: unknown) => (Array.isArray(arr) ? arr : []);
  const names = (arr: unknown[]) =>
    arr
      .map((p) => (p as { name?: string; id?: string }).name ?? (p as { id?: string }).id ?? String(p))
      .slice(0, 3)
      .join(', ') + (arr.length > 3 ? ` +${arr.length - 3}` : '');

  if (name.includes('set_status') || name.includes('todowrite') || name.includes('todo')) return null;
  if (name.includes('model_part')) {
    const n = (input.name as string) || (input.id as string) || 'part';
    return { title: `${verb('Designing', 'Designed')} ${n}`, detail: input.language === 'replicad' ? 'OpenCascade' : 'OpenSCAD' };
  }
  if (name.includes('get_part_code')) return { title: verb('Reading part code', 'Read part code'), detail: String(input.id ?? '') || undefined };
  if (name.includes('add_parts')) {
    const parts = list(input.parts);
    const groups = Array.from(new Set(parts.map((p) => (p as { group?: string }).group).filter(Boolean))) as string[];
    return { title: `${verb('Blocking out', 'Blocked out')} ${parts.length || ''} parts`.replace('  ', ' '), detail: groups.join(', ') || names(parts) || undefined };
  }
  if (name.includes('update_parts')) {
    const u = list(input.updates);
    return { title: `${verb('Adjusting', 'Adjusted')} ${u.length || ''} parts`.replace('  ', ' '), detail: names(u) || undefined };
  }
  if (name.includes('delete_parts')) {
    const ids = list(input.ids);
    return { title: `${verb('Removing', 'Removed')} ${ids.length} parts`, detail: names(ids) || undefined };
  }
  if (name.includes('mirror_parts')) {
    const ids = list(input.ids);
    return { title: `${verb('Mirroring', 'Mirrored')} ${ids.length} parts`, detail: names(ids) || undefined };
  }
  if (name.includes('compare')) {
    return { title: verb('Comparing with', 'Compared with') + ` ${String(input.reference ?? 'the reference')}`, detail: list(input.views).join(', ') || undefined };
  }
  if (name.includes('look')) {
    const ids = list(input.ids);
    return {
      title: ids.length ? `${verb('Inspecting', 'Inspected')} ${names(ids)}` : verb('Looking at the model', 'Looked at the model'),
      detail: list(input.views).join(', ') || undefined,
    };
  }
  if (name.includes('check_scene')) return { title: verb('Checking the model', 'Checked the model') };
  if (name.includes('robot_skeleton')) {
    const file = String(input.url ?? '').split('/').pop();
    return { title: verb('Reading the joint layout', 'Read the joint layout'), detail: file || undefined };
  }
  if (name.includes('list_evidence')) return { title: verb('Listing attached files', 'Listed attached files') };
  if (name.includes('read_evidence')) {
    const paths = list(input.paths).map((p) => String(p).split('/').pop() ?? '');
    return { title: `${verb('Studying', 'Studied')} ${paths.length > 1 ? `${paths.length} attached files` : 'an attached file'}`, detail: names(paths) || undefined };
  }
  if (name.includes('find_images')) {
    let host = '';
    try {
      host = new URL(String(input.url)).hostname;
    } catch {
      /* not a URL */
    }
    return { title: verb('Finding photos', 'Found photos'), detail: host || undefined };
  }
  if (name.includes('view_image')) {
    const urls = list(input.urls);
    return { title: `${verb('Looking at', 'Looked at')} ${urls.length > 1 ? `${urls.length} photos` : 'a photo'}` };
  }
  if (name.includes('get_scene')) return { title: verb('Reading the scene', 'Read the scene') };
  if (name.includes('websearch') || name.includes('web search')) return { title: verb('Searching', 'Searched'), detail: String(input.query ?? '') || undefined };
  if (name.includes('webfetch') || name.includes('fetch')) {
    let host = '';
    try {
      host = new URL(String(input.url)).hostname;
    } catch {
      /* not a URL */
    }
    return { title: verb('Reading', 'Read'), detail: host || undefined };
  }
  return { title: tc.title || 'Tool' };
}

/** A placeholder whose example changes every few seconds: each wipes in from left to right, holds, then fades out */
const CyclingPlaceholder: React.FC<{ examples: string[] }> = ({ examples }) => {
  const [index, setIndex] = useState(0);

  const example = examples[index];
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 px-4 pt-3 text-[14px] leading-relaxed text-white/[0.32] pointer-events-none whitespace-nowrap overflow-hidden"
    >
      <span
        key={example}
        className="inline-block [animation:placeholder-cycle_var(--cycle)_linear_both] motion-reduce:[animation:none] [mask-image:linear-gradient(to_right,black_35%,transparent_65%)] [mask-size:300%_100%]"
        style={{ '--cycle': `${EXAMPLE_INTERVAL_MS}ms` } as React.CSSProperties}
        // Each turn ends by fading out, then the next example takes over (no animation, no cycling, under reduced motion)
        onAnimationEnd={() => setIndex((i) => (i + 1) % examples.length)}
      >
        {example}
      </span>
    </div>
  );
};

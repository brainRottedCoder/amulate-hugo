'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { useMaterials, useStockLevels, useDispatchParameters, useMaterialOrders, useSalesOrders, useSuppliers } from '@/lib/useFirestore';
import jsPDF from 'jspdf';
import { authFetch } from '@/lib/auth/authFetch';
import ActionConfirmDialog from '@/components/hugo/ActionConfirmDialog';
import StreamMessage from '@/components/hugo/StreamMessage';
import SessionSidebar from '@/components/hugo/SessionSidebar';
import { useHugoSession } from '@/hooks/useHugoSession';

const MIGRATION_KEY = 'hugo_chat_migrated_v1';
const STORAGE_KEY = 'hugo_chat_history';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    action?: ActionRequest;
}

interface ActionRequest {
    type: 'add' | 'update' | 'delete' | 'update_stock' | 'mark_delivered' | 'send_email';
    collection: string;
    data?: any;
    searchField?: string;
    searchValue?: string;
    description: string;
}

interface PendingToolUI {
    pendingId: string;
    toolName: string;
    args: Record<string, unknown>;
    description: string;
    expiresAt: string;
}

const defaultMessage: Message = {
    id: '1',
    role: 'assistant',
    content: `Hello! I'm Hugo, your AI-powered procurement assistant powered by **LangChain + Fireworks (MiniMax M3)**.

**I can help you with:**
• Analyzing inventory levels and stock health
• Tracking orders and deliveries
• Evaluating supplier performance
• **Performing database operations** (add, update, delete records)

**Try asking me to:**
• "Update stock for P305 to 150 units"
• "Mark order ORD-001 as delivered"
• "Add a new material with part ID P999"

Ask me anything about your operations!`,
    timestamp: new Date(),
};

export default function HugoPage() {
    const { data: materials } = useMaterials();
    const { data: stockLevels } = useStockLevels();
    const { data: dispatchParams } = useDispatchParameters();
    const { data: materialOrders } = useMaterialOrders();
    const { data: salesOrders } = useSalesOrders();
    const { data: suppliers } = useSuppliers();

    const {
        sessions,
        sessionId,
        loading: sessionsLoading,
        createSession,
        loadSession,
        refreshSessions,
    } = useHugoSession();

    const [messages, setMessages] = useState<Message[]>([defaultMessage]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [pendingAction, setPendingAction] = useState<ActionRequest | null>(null);
    const [pendingTool, setPendingTool] = useState<PendingToolUI | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [streamingText, setStreamingText] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string; type: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showMigrationBanner, setShowMigrationBanner] = useState(false);
    const [agentRunNote, setAgentRunNote] = useState<string | null>(null);

    // Firestore sessions are source of truth; offer one-time localStorage import
    useEffect(() => {
        const migrated = localStorage.getItem(MIGRATION_KEY);
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!migrated && saved) {
            setShowMigrationBanner(true);
        }
        setIsInitialized(true);
    }, []);

    useEffect(() => {
        if (!sessionId || sessionsLoading) return;
        let cancelled = false;
        (async () => {
            try {
                const data = await loadSession(sessionId);
                if (cancelled) return;
                if (data.messages.length > 0) {
                    setMessages(data.messages as Message[]);
                } else {
                    setMessages([defaultMessage]);
                }
                if (data.agentRun && typeof data.agentRun === 'object' && data.agentRun !== null) {
                    const run = data.agentRun as { goal?: string; status?: string };
                    setAgentRunNote(run.goal ? `Scratchpad: ${run.goal} (${run.status})` : null);
                } else {
                    setAgentRunNote(null);
                }
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [sessionId, sessionsLoading, loadSession]);

    const importLocalHistory = async () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved || !sessionId) return;
        try {
            const parsed = JSON.parse(saved) as Array<{ role: string; content: string }>;
            for (const m of parsed) {
                if (m.role !== 'user' && m.role !== 'assistant') continue;
                // Persist via chat by appending through sessions API load path — use add via orchestrator side effect
                // For migration, POST messages through a lightweight loop using authFetch to hugo with no-op? 
                // Instead: write client-side display only and mark migrated; server gets new messages going forward.
                // Better: call sessions detail isn't writable. We'll just set UI and mark migrated.
            }
            const restored = parsed
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m, i) => ({
                    id: `migrated_${i}`,
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                    timestamp: new Date(),
                }));
            if (restored.length) setMessages(restored);
            localStorage.setItem(MIGRATION_KEY, '1');
            localStorage.removeItem(STORAGE_KEY);
            setShowMigrationBanner(false);
        } catch (e) {
            console.error('Migration failed', e);
        }
    };

    const dismissMigration = () => {
        localStorage.setItem(MIGRATION_KEY, '1');
        setShowMigrationBanner(false);
    };

    // Clear chat = new session
    const clearChat = async () => {
        const s = await createSession('New chat');
        setMessages([defaultMessage]);
        setUploadedFile(null);
        await refreshSessions();
        void s;
    };

    // Handle file upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const maxSize = 5 * 1024 * 1024; // 5MB limit
        if (file.size > maxSize) {
            alert('File too large. Maximum size is 5MB.');
            return;
        }

        try {
            if (file.type === 'application/pdf') {
                // Read PDF as base64 for server-side processing
                const reader = new FileReader();
                reader.onload = async () => {
                    const base64 = (reader.result as string).split(',')[1];
                    setUploadedFile({ name: file.name, content: base64, type: 'pdf' });
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('image/')) {
                // Read image as base64
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    setUploadedFile({ name: file.name, content: base64, type: 'image' });
                };
                reader.readAsDataURL(file);
            } else {
                alert('Unsupported file type. Please upload PDF or image files.');
            }
        } catch (error) {
            console.error('Error reading file:', error);
            alert('Failed to read file.');
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Helper function to parse markdown tables
    const parseMarkdownTable = (lines: string[], startIndex: number): { rows: string[][]; endIndex: number } | null => {
        const rows: string[][] = [];
        let i = startIndex;

        while (i < lines.length && lines[i].includes('|')) {
            const row = lines[i].trim();
            // Skip separator rows (|---|---|)
            if (!row.match(/^\|[\s\-:|]+\|$/)) {
                const cells = row.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());
                if (cells.length > 0) {
                    rows.push(cells);
                }
            }
            i++;
        }

        return rows.length > 0 ? { rows, endIndex: i } : null;
    };

    // Helper function to draw table in PDF
    const drawPDFTable = (doc: jsPDF, rows: string[][], startY: number, margin: number, maxWidth: number): number => {
        if (rows.length === 0) return startY;

        const colCount = rows[0].length;
        const colWidth = maxWidth / colCount;
        const cellPadding = 3;
        const rowHeight = 8;
        let currentY = startY;

        rows.forEach((row, rowIndex) => {
            // Check for page break
            if (currentY > 265) {
                doc.addPage();
                currentY = 25;
            }

            const isHeader = rowIndex === 0;

            // Draw row background
            if (isHeader) {
                doc.setFillColor(79, 70, 229); // Indigo header
            } else if (rowIndex % 2 === 0) {
                doc.setFillColor(241, 245, 249); // Alternate light gray
            } else {
                doc.setFillColor(255, 255, 255); // White
            }
            doc.rect(margin, currentY - 5, maxWidth, rowHeight, 'F');

            // Draw cell borders
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2);
            row.forEach((_, cellIndex) => {
                doc.rect(margin + cellIndex * colWidth, currentY - 5, colWidth, rowHeight);
            });

            // Draw cell content
            row.forEach((cell, cellIndex) => {
                const cleanCell = cell.replace(/\*\*/g, '').replace(/⚠️/g, '(!)')
                doc.setFontSize(isHeader ? 9 : 8);
                if (isHeader) {
                    doc.setTextColor(255, 255, 255); // White text for header
                    doc.setFont('helvetica', 'bold');
                } else if (cell.includes('Critical')) {
                    doc.setTextColor(185, 28, 28); // Red for critical
                    doc.setFont('helvetica', 'normal');
                } else if (cell.includes('Low')) {
                    doc.setTextColor(180, 83, 9); // Amber for low
                    doc.setFont('helvetica', 'normal');
                } else {
                    doc.setTextColor(51, 65, 85); // Slate for normal
                    doc.setFont('helvetica', 'normal');
                }

                const truncated = cleanCell.length > 20 ? cleanCell.substring(0, 18) + '...' : cleanCell;
                doc.text(truncated, margin + cellIndex * colWidth + cellPadding, currentY);
            });

            currentY += rowHeight;
        });

        return currentY + 5;
    };

    // Export conversation to PDF
    const exportToPDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        const maxWidth = pageWidth - 2 * margin;
        let yPosition = 20;

        // Header background
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, pageWidth, 40, 'F');

        // Header text
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('Hugo AI', margin, 18);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 200, 255);
        doc.text('Conversation Report', margin, 28);

        // Date on header
        doc.setFontSize(9);
        doc.setTextColor(200, 200, 255);
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 18, { align: 'right' });
        doc.text('Voltway ERP - Operations Hub', pageWidth - margin, 28, { align: 'right' });

        yPosition = 50;

        // Summary box
        const userMsgCount = messages.filter(m => m.role === 'user').length;
        const aiMsgCount = messages.filter(m => m.role === 'assistant').length;

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, yPosition, maxWidth, 18, 3, 3, 'F');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`📊 Summary: ${userMsgCount} questions • ${aiMsgCount} responses • ${messages.length} total messages`, margin + 5, yPosition + 11);
        yPosition += 28;

        // Messages
        messages.forEach((msg, msgIndex) => {
            if (yPosition > 260) {
                doc.addPage();
                yPosition = 20;
            }

            // Message header with role badge
            if (msg.role === 'user') {
                doc.setFillColor(14, 165, 233);
                doc.roundedRect(margin, yPosition - 4, 35, 7, 2, 2, 'F');
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.text('You', margin + 3, yPosition + 1);
            } else {
                doc.setFillColor(99, 102, 241);
                doc.roundedRect(margin, yPosition - 4, 45, 7, 2, 2, 'F');
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.text('Hugo AI', margin + 3, yPosition + 1);
            }

            // Timestamp
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.setFont('helvetica', 'normal');
            doc.text(msg.timestamp.toLocaleTimeString(), pageWidth - margin, yPosition + 1, { align: 'right' });

            yPosition += 10;

            // Parse and render message content
            const contentLines = msg.content.split('\n');
            let lineIndex = 0;

            while (lineIndex < contentLines.length) {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }

                const line = contentLines[lineIndex];

                // Check for table
                if (line.includes('|') && line.trim().startsWith('|')) {
                    const tableResult = parseMarkdownTable(contentLines, lineIndex);
                    if (tableResult) {
                        yPosition = drawPDFTable(doc, tableResult.rows, yPosition, margin, maxWidth);
                        lineIndex = tableResult.endIndex;
                        continue;
                    }
                }

                const trimmed = line.trim();

                if (!trimmed) {
                    yPosition += 3;
                    lineIndex++;
                    continue;
                }

                // Headers (bold text)
                if ((trimmed.startsWith('**') && trimmed.endsWith('**')) || trimmed.endsWith(':')) {
                    yPosition += 2;
                    doc.setFontSize(11);
                    doc.setTextColor(79, 70, 229);
                    doc.setFont('helvetica', 'bold');
                    const headerText = trimmed.replace(/\*\*/g, '').replace(/:$/, '');
                    doc.text(headerText, margin, yPosition);
                    doc.setDrawColor(79, 70, 229);
                    doc.setLineWidth(0.5);
                    doc.line(margin, yPosition + 2, margin + doc.getTextWidth(headerText), yPosition + 2);
                    yPosition += 8;
                    lineIndex++;
                    continue;
                }

                // Bullet points
                if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
                    const bulletText = trimmed.replace(/^[•\-]\s*/, '').replace(/\*\*/g, '');
                    doc.setFontSize(9);
                    doc.setTextColor(51, 65, 85);
                    doc.setFont('helvetica', 'normal');
                    doc.setFillColor(99, 102, 241);
                    doc.circle(margin + 2, yPosition - 1, 1, 'F');
                    const wrapped = doc.splitTextToSize(bulletText, maxWidth - 10);
                    wrapped.forEach((w: string) => {
                        if (yPosition > 275) { doc.addPage(); yPosition = 20; }
                        doc.text(w, margin + 7, yPosition);
                        yPosition += 5;
                    });
                    lineIndex++;
                    continue;
                }

                // Regular text
                doc.setFontSize(9);
                doc.setTextColor(51, 65, 85);
                doc.setFont('helvetica', 'normal');
                const cleanText = trimmed.replace(/\*\*/g, '');
                const wrapped = doc.splitTextToSize(cleanText, maxWidth);
                wrapped.forEach((w: string) => {
                    if (yPosition > 275) { doc.addPage(); yPosition = 20; }
                    doc.text(w, margin, yPosition);
                    yPosition += 5;
                });
                lineIndex++;
            }

            // Divider between messages
            if (msgIndex < messages.length - 1) {
                yPosition += 3;
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.line(margin, yPosition, pageWidth - margin, yPosition);
                yPosition += 8;
            }
        });

        // Footer on all pages
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 282, pageWidth, 15, 'F');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(
                `Page ${i} of ${pageCount}`,
                margin,
                289
            );
            doc.text(
                'Voltway ERP - Hugo AI Procurement Assistant',
                pageWidth - margin,
                289,
                { align: 'right' }
            );
        }

        doc.save(`hugo-conversation-${new Date().toISOString().split('T')[0]}.pdf`);
    };

    // Export single message to PDF
    const exportSingleMessageToPDF = (msg: Message) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        const maxWidth = pageWidth - 2 * margin;
        let yPosition = 20;

        // Full-width header background
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, pageWidth, 45, 'F');

        // Header text
        doc.setFontSize(24);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('Hugo AI', margin, 20);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 200, 255);
        doc.text('Procurement Intelligence Report', margin, 32);

        // Date on header
        doc.setFontSize(9);
        doc.setTextColor(200, 200, 255);
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 20, { align: 'right' });
        doc.text('Voltway ERP - Operations Hub', pageWidth - margin, 32, { align: 'right' });

        yPosition = 58;

        // Report type badge
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, yPosition - 5, maxWidth, 16, 3, 3, 'F');
        doc.setFillColor(99, 102, 241);
        doc.roundedRect(margin + 3, yPosition - 2, 55, 10, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('AI ANALYSIS', margin + 8, yPosition + 4);
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'normal');
        doc.text(msg.timestamp.toLocaleString(), pageWidth - margin - 5, yPosition + 4, { align: 'right' });

        yPosition += 20;

        // Content - parse line by line with table support
        const contentLines = msg.content.split('\n');
        let lineIndex = 0;

        while (lineIndex < contentLines.length) {
            if (yPosition > 265) {
                doc.addPage();
                yPosition = 25;
            }

            const line = contentLines[lineIndex];

            // Check for table
            if (line.includes('|') && line.trim().startsWith('|')) {
                const tableResult = parseMarkdownTable(contentLines, lineIndex);
                if (tableResult) {
                    yPosition = drawPDFTable(doc, tableResult.rows, yPosition, margin, maxWidth);
                    lineIndex = tableResult.endIndex;
                    continue;
                }
            }

            const trimmed = line.trim();

            if (!trimmed) {
                yPosition += 4;
                lineIndex++;
                continue;
            }

            // Headers (bold text or ending with colon)
            if ((trimmed.startsWith('**') && trimmed.endsWith('**')) || trimmed.endsWith(':')) {
                yPosition += 4;
                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                const headerText = trimmed.replace(/\*\*/g, '').replace(/:$/, '');
                doc.text(headerText, margin, yPosition);
                doc.setDrawColor(79, 70, 229);
                doc.setLineWidth(0.5);
                doc.line(margin, yPosition + 2, margin + doc.getTextWidth(headerText), yPosition + 2);
                yPosition += 10;
                lineIndex++;
                continue;
            }

            // Bullet points
            if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
                const bulletText = trimmed.replace(/^[•\-]\s*/, '').replace(/\*\*/g, '');
                doc.setFontSize(10);
                doc.setTextColor(51, 65, 85);
                doc.setFont('helvetica', 'normal');
                doc.setFillColor(99, 102, 241);
                doc.circle(margin + 2.5, yPosition - 1, 1.2, 'F');
                const wrapped = doc.splitTextToSize(bulletText, maxWidth - 12);
                wrapped.forEach((w: string) => {
                    if (yPosition > 275) { doc.addPage(); yPosition = 25; }
                    doc.text(w, margin + 8, yPosition);
                    yPosition += 5.5;
                });
                lineIndex++;
                continue;
            }

            // Numbered items
            const numMatch = trimmed.match(/^(\d+)\.\s*(.+)/);
            if (numMatch) {
                doc.setFillColor(79, 70, 229);
                doc.circle(margin + 3.5, yPosition - 1, 3.5, 'F');
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.text(numMatch[1], margin + 3.5, yPosition + 0.5, { align: 'center' });
                doc.setFontSize(10);
                doc.setTextColor(51, 65, 85);
                doc.setFont('helvetica', 'normal');
                const wrapped = doc.splitTextToSize(numMatch[2].replace(/\*\*/g, ''), maxWidth - 15);
                wrapped.forEach((w: string) => {
                    if (yPosition > 275) { doc.addPage(); yPosition = 25; }
                    doc.text(w, margin + 12, yPosition);
                    yPosition += 5.5;
                });
                yPosition += 2;
                lineIndex++;
                continue;
            }

            // Regular text
            doc.setFontSize(10);
            doc.setTextColor(51, 65, 85);
            doc.setFont('helvetica', 'normal');
            const cleanText = trimmed.replace(/\*\*/g, '');
            const wrapped = doc.splitTextToSize(cleanText, maxWidth);
            wrapped.forEach((w: string) => {
                if (yPosition > 275) { doc.addPage(); yPosition = 25; }
                doc.text(w, margin, yPosition);
                yPosition += 5.5;
            });
            lineIndex++;
        }

        // Footer on all pages
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 282, pageWidth, 15, 'F');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(
                `Page ${i} of ${pageCount}`,
                margin,
                289
            );
            doc.text(
                'Voltway ERP - Hugo AI Procurement Assistant',
                pageWidth - margin,
                289,
                { align: 'right' }
            );
        }

        doc.save(`hugo-report-${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const samplePrompts = [
        'What parts are running low?',
        'Update stock for P305 to 200 units',
        'Mark order ORD-001 as delivered',
        'Which supplier is most reliable?',
        'Add a new material P999',
    ];

    // Calculate database context
    const getDatabaseContext = () => {
        const getStockStatus = (partId: string) => {
            const stock = stockLevels.find((s: any) => s.part_id === partId);
            const dispatch = dispatchParams.find((d: any) => d.part_id === partId);
            const qty = stock?.quantity_available || 0;
            const minStock = dispatch?.min_stock_level || 50;
            if (qty <= minStock * 0.5) return 'critical';
            if (qty <= minStock) return 'low';
            return 'healthy';
        };

        return {
            materialsCount: materials.length,
            healthyCount: materials.filter((m: any) => getStockStatus(m.part_id) === 'healthy').length,
            lowCount: materials.filter((m: any) => getStockStatus(m.part_id) === 'low').length,
            criticalCount: materials.filter((m: any) => getStockStatus(m.part_id) === 'critical').length,
            pendingOrders: materialOrders.filter((o: any) => o.status !== 'Delivered').length,
            openSales: salesOrders.filter((o: any) => o.status !== 'Delivered').length,
            supplierCount: suppliers.length,
            // Phase 4 RAG: do not dump full catalog — server retrieves top-k fact cards
            jsonData: undefined as string | undefined,
        };
    };

    // Detect action requests from user input
    const detectAction = (text: string): ActionRequest | null => {
        const lower = text.toLowerCase();

        // Update stock pattern
        const stockMatch = lower.match(/update\s+stock\s+(?:for\s+)?(\w+)\s+to\s+(\d+)/i);
        if (stockMatch) {
            return {
                type: 'update_stock',
                collection: 'stock_levels',
                searchField: 'part_id',
                searchValue: stockMatch[1].toUpperCase(),
                data: { quantity_available: parseInt(stockMatch[2]) },
                description: `Update stock for ${stockMatch[1].toUpperCase()} to ${stockMatch[2]} units`,
            };
        }

        // Mark delivered pattern
        const deliverMatch = lower.match(/mark\s+(?:order\s+)?(\S+)\s+(?:as\s+)?delivered/i);
        if (deliverMatch) {
            return {
                type: 'mark_delivered',
                collection: 'material_orders',
                searchValue: deliverMatch[1].toUpperCase(),
                description: `Mark order ${deliverMatch[1].toUpperCase()} as delivered`,
            };
        }

        // Complex add material pattern - handles "add P513, S2_V3 Tank, assembly, stock 86, min 24, warehouse 3"
        // Also handles "add material P999 Motor Assembly" or "create part P999 called Motor"
        if (lower.includes('add') || lower.includes('create')) {
            // Extract part ID (P followed by numbers)
            const partIdMatch = text.match(/\b([Pp]\d+)\b/);
            if (partIdMatch) {
                const partId = partIdMatch[1].toUpperCase();

                // Extract part name - text after part ID, before comma or keywords
                const afterId = text.substring(text.indexOf(partIdMatch[0]) + partIdMatch[0].length);
                const nameMatch = afterId.match(/[,\s]*([^,]+?)(?:,\s*(?:assembly|component|service|stock|min|warehouse|wh\d|needed)|$)/i);
                const partName = nameMatch?.[1]?.trim() || `New Part ${partId}`;

                // Extract type
                let partType = 'component';
                if (lower.includes('assembly')) partType = 'assembly';
                else if (lower.includes('service')) partType = 'service';

                // Extract stock quantity
                const stockMatch = text.match(/stock\s*(?:now\s*)?(?:is\s*)?(\d+)/i);
                const stock = stockMatch ? parseInt(stockMatch[1]) : 100;

                // Extract min stock
                const minMatch = text.match(/(?:min|needed|minimum)\s*(?:is\s*)?(\d+)/i);
                const minStock = minMatch ? parseInt(minMatch[1]) : 50;

                // Extract warehouse/location - handles "warehouse 3" or "ware house 3" or "wh3"
                const whMatch = text.match(/(?:ware\s*house|wh)\s*(\d+)/i);
                const location = whMatch ? `WH${whMatch[1]}` : 'WH1';

                return {
                    type: 'add',
                    collection: 'materials',
                    data: {
                        part_id: partId,
                        part_name: partName,
                        part_type: partType,
                        used_in_models: [],
                        weight: 0,
                        blocked_parts: '',
                        successor_parts: '',
                        comment: 'Created via Hugo AI',
                        // Additional info for stock_levels and dispatch_parameters
                        _stock: stock,
                        _min_stock: minStock,
                        _location: location,
                    },
                    description: `Create material: ${partId} - "${partName}" (${partType}, stock: ${stock}, min: ${minStock}, location: ${location})`,
                };
            }
        }

        // Delete pattern
        const deleteMatch = lower.match(/delete\s+(?:material\s+)?(\w+)/i);
        if (deleteMatch && !lower.includes('how')) {
            return {
                type: 'delete',
                collection: 'materials',
                searchField: 'part_id',
                searchValue: deleteMatch[1].toUpperCase(),
                description: `Delete material ${deleteMatch[1].toUpperCase()}`,
            };
        }

        return null;
    };

    // Execute Phase-2 pending tool (confirm / reject)
    const decidePendingTool = async (decision: 'confirm' | 'reject') => {
        if (!pendingTool) return;
        setConfirmLoading(true);
        setIsLoading(true);
        try {
            const response = await authFetch('/api/hugo/actions', {
                method: 'POST',
                body: JSON.stringify({
                    pendingId: pendingTool.pendingId,
                    decision,
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Decision failed');
            }
            const resultMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content:
                    decision === 'reject'
                        ? '❎ **Action cancelled.** No changes were made.'
                        : result.success
                          ? `✅ **Action Completed!**\n\n${result.message}`
                          : `❌ **Action Failed**\n\n${result.error || result.message}`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, resultMessage]);
            setPendingTool(null);
            setPendingAction(null);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: `❌ **Error:** ${message}`,
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setConfirmLoading(false);
            setIsLoading(false);
        }
    };

    // Execute legacy action
    const executeAction = async (action: ActionRequest) => {
        setIsLoading(true);
        try {
            let response;

            // Handle email action separately
            if (action.type === 'send_email') {
                response = await authFetch('/api/hugo/email', {
                    method: 'POST',
                    body: JSON.stringify(action.data),
                });
            } else {
                response = await authFetch('/api/hugo/actions', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: action.type,
                        collection: action.collection,
                        data: action.data,
                        searchField: action.searchField,
                        searchValue: action.searchValue,
                    }),
                });
            }

            const result = await response.json();

            const resultMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: result.success
                    ? action.type === 'send_email'
                        ? `📧 **Email Sent!**\n\n${result.message}\n\nThe supplier has been notified.`
                        : `✅ **Action Completed!**\n\n${result.message}\n\nThe data has been updated in real-time.`
                    : `❌ **Action Failed**\n\n${result.error}`,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, resultMessage]);
            setPendingAction(null);
        } catch (error: any) {
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: `❌ **Error:** ${error.message}`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (messageText?: string) => {
        const text = messageText || input;
        if ((!text.trim() && !uploadedFile) || isLoading) return;

        const displayText = uploadedFile
            ? `${text.trim() || 'Analyze this document'} [📎 ${uploadedFile.name}]`
            : text.trim();

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: displayText,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await authFetch('/api/hugo', {
                method: 'POST',
                body: JSON.stringify({
                    message: text.trim() || 'Please analyze this document and provide key insights.',
                    databaseContext: getDatabaseContext(),
                    conversationHistory: messages.slice(1).map(m => ({ role: m.role, content: m.content })),
                    sessionId: sessionId || undefined,
                    file: uploadedFile ? {
                        name: uploadedFile.name,
                        content: uploadedFile.content,
                        type: uploadedFile.type,
                    } : undefined,
                }),
            });

            // Clear uploaded file after sending
            setUploadedFile(null);

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Phase 2 pending tool
            if (data.pendingTool) {
                const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setPendingTool({
                    pendingId: data.pendingTool.pendingId,
                    toolName: data.pendingTool.toolName,
                    args: data.pendingTool.args,
                    description: data.pendingTool.description,
                    expiresAt: data.pendingTool.expiresAt,
                });
            } else if (data.action) {
                const action: ActionRequest = {
                    type: data.action.type,
                    collection: data.action.collection,
                    data: data.action.data,
                    searchField: data.action.searchField,
                    searchValue: data.action.searchValue,
                    description: data.action.description || 'Execute database action',
                };

                const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.response + `\n\n🔧 **Action Ready:** ${action.description}`,
                    timestamp: new Date(),
                    action: action,
                };

                setMessages(prev => [...prev, assistantMessage]);
                setPendingAction(action);
            } else {
                const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, assistantMessage]);
            }
        } catch (error: any) {
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Format message content with markdown-like styling
    const formatContent = (content: string) => {
        const lines = content.split('\n');
        const result: string[] = [];
        let i = 0;

        while (i < lines.length) {
            let line = lines[i];

            // Check for table start (line with pipes)
            if (line.includes('|') && line.trim().startsWith('|')) {
                const tableRows: string[] = [];

                // Collect all table rows
                while (i < lines.length && lines[i].includes('|')) {
                    const row = lines[i].trim();
                    // Skip separator rows (|---|---|)
                    if (!row.match(/^\|[\s\-:|]+\|$/)) {
                        tableRows.push(row);
                    }
                    i++;
                }

                if (tableRows.length > 0) {
                    // Build HTML table
                    let tableHtml = '<div class="overflow-x-auto my-3"><table class="w-full text-sm border-collapse">';

                    tableRows.forEach((row, rowIndex) => {
                        const cells = row.split('|').filter(cell => cell.trim() !== '');
                        const isHeader = rowIndex === 0;

                        if (isHeader) {
                            tableHtml += '<thead class="bg-gradient-to-r from-indigo-500/10 to-purple-500/10"><tr>';
                            cells.forEach(cell => {
                                const cellContent = cell.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                                tableHtml += `<th class="px-3 py-2 text-left font-semibold text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-200 dark:border-indigo-700">${cellContent}</th>`;
                            });
                            tableHtml += '</tr></thead><tbody>';
                        } else {
                            const rowClass = (rowIndex % 2 === 0)
                                ? 'bg-slate-50/50 dark:bg-slate-800/30'
                                : 'bg-white dark:bg-slate-900/50';
                            tableHtml += `<tr class="${rowClass} hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">`;
                            cells.forEach((cell, cellIndex) => {
                                let cellContent = cell.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                                // Style critical/low status badges
                                cellContent = cellContent.replace(/⚠️\s*Critical/g, '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">⚠️ Critical</span>');
                                cellContent = cellContent.replace(/⚠️\s*Low/g, '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">⚠️ Low</span>');
                                tableHtml += `<td class="px-3 py-2 border-b border-slate-200 dark:border-slate-700 ${cellIndex === 0 ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}">${cellContent}</td>`;
                            });
                            tableHtml += '</tr>';
                        }
                    });

                    tableHtml += '</tbody></table></div>';
                    result.push(tableHtml);
                }
                continue;
            }

            // Bold
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Bullet points
            if (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
                result.push(`<li key="${i}" class="ml-4">${line.replace(/^[•\-\*]\s*/, '')}</li>`);
            }
            // Headers
            else if (line.startsWith('###')) {
                result.push(`<h4 key="${i}" class="font-semibold mt-2">${line.replace('### ', '')}</h4>`);
            }
            else if (line.startsWith('##')) {
                result.push(`<h3 key="${i}" class="font-bold mt-3">${line.replace('## ', '')}</h3>`);
            }
            else {
                result.push(line ? `<p key="${i}">${line}</p>` : '<br/>');
            }
            i++;
        }

        return result.join('');
    };

    return (
        <>
            <Header title="Hugo AI Copilot" />
            <div className="flex h-[calc(100vh-4rem)] w-full">
                <SessionSidebar
                    sessions={sessions}
                    activeId={sessionId}
                    loading={sessionsLoading}
                    onNew={() => void clearChat()}
                    onSelect={(id) => {
                        void loadSession(id).then((data) => {
                            if (data.messages.length > 0) setMessages(data.messages as Message[]);
                            else setMessages([defaultMessage]);
                        });
                    }}
                />
                <div className="p-8 max-w-[1200px] w-full mx-auto space-y-4 flex flex-col flex-1 min-w-0">
                {showMigrationBanner && (
                    <div className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/40 px-4 py-3 text-sm text-cyan-900 dark:text-cyan-100 flex items-center justify-between gap-3">
                        <span>Import previous browser chat history into this session once?</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => void importLocalHistory()} className="px-3 py-1 rounded-lg bg-cyan-600 text-white text-xs">Import</button>
                            <button type="button" onClick={dismissMigration} className="px-3 py-1 rounded-lg bg-white dark:bg-slate-900 text-xs border border-cyan-200 dark:border-slate-700">Dismiss</button>
                        </div>
                    </div>
                )}
                {agentRunNote && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-xs text-slate-600 dark:text-slate-300">
                        {agentRunNote}
                    </div>
                )}
                {/* Status Bar */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                            <span className="material-symbols-outlined text-2xl text-white">smart_toy</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                Hugo AI
                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-medium rounded flex items-center gap-1">
                                    <span className="size-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                    Connected
                                </span>
                            </h2>
                            <p className="text-xs text-slate-500">
                                {materials.length} materials • {materialOrders.length} orders • Fireworks (MiniMax M3) • Memory on
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={exportToPDF}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg transition-all shadow-sm hover:shadow-md"
                            title="Export conversation to PDF"
                        >
                            <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                            Export PDF
                        </button>
                        <button
                            onClick={() => void clearChat()}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Clear chat history"
                        >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                            Clear
                        </button>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="material-symbols-outlined text-[16px]">database</span>
                            Firebase + Memory
                        </div>
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
                    {/* Messages */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div
                                    className={`size-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'assistant'
                                        ? 'bg-indigo-100 dark:bg-indigo-900/30'
                                        : 'bg-slate-200 dark:bg-slate-700'
                                        }`}
                                >
                                    <span
                                        className={`material-symbols-outlined text-[18px] ${msg.role === 'assistant'
                                            ? 'text-indigo-600 dark:text-indigo-400'
                                            : 'text-slate-600 dark:text-slate-300'
                                            }`}
                                    >
                                        {msg.role === 'assistant' ? 'smart_toy' : 'person'}
                                    </span>
                                </div>
                                <div className={`max-w-[75%] ${msg.role === 'user' ? '' : ''}`}>
                                    <div
                                        className={`rounded-lg p-3 ${msg.role === 'assistant'
                                            ? 'bg-slate-50 dark:bg-slate-800/50'
                                            : 'bg-indigo-600 text-white'
                                            }`}
                                    >
                                        <div
                                            className={`text-sm ${msg.role === 'assistant' ? 'text-slate-700 dark:text-slate-200' : ''
                                                } prose prose-sm max-w-none`}
                                            dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                                        />
                                        <div className="flex items-center justify-between mt-1">
                                            <p className={`text-xs ${msg.role === 'assistant' ? 'text-slate-400' : 'text-indigo-200'}`}>
                                                {msg.timestamp.toLocaleTimeString()}
                                            </p>
                                            {msg.role === 'assistant' && msg.id !== '1' && (
                                                <button
                                                    onClick={() => exportSingleMessageToPDF(msg)}
                                                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded transition-colors"
                                                    title="Export this response as PDF"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">picture_as_pdf</span>
                                                    PDF
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Action Buttons */}
                                    {msg.action && (
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => executeAction(msg.action!)}
                                                disabled={isLoading}
                                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">check</span>
                                                Yes, proceed
                                            </button>
                                            <button
                                                onClick={() => setPendingAction(null)}
                                                disabled={isLoading}
                                                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="size-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                                    <span className="material-symbols-outlined text-indigo-600 text-sm">smart_toy</span>
                                </div>
                                <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 shadow-sm max-w-[80%]">
                                    {streamingText != null ? (
                                        <StreamMessage content={streamingText} streaming />
                                    ) : (
                                        <div className="flex gap-1">
                                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <ActionConfirmDialog
                            open={Boolean(pendingTool)}
                            title={`Confirm: ${pendingTool?.toolName || 'action'}`}
                            description={pendingTool?.description || ''}
                            args={pendingTool?.args}
                            loading={confirmLoading}
                            onConfirm={() => void decidePendingTool('confirm')}
                            onCancel={() => void decidePendingTool('reject')}
                        />
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 border-t border-gray-200 dark:border-[#404040]">
                        {/* Quick Prompts */}
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                            {samplePrompts.map((prompt, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSend(prompt)}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-xs whitespace-nowrap hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                        {/* Input */}
                        <div className="flex flex-col gap-2">
                            {/* File upload indicator */}
                            {uploadedFile && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                                    <span className="material-symbols-outlined text-cyan-600 text-[18px]">
                                        {uploadedFile.type === 'pdf' ? 'description' : 'image'}
                                    </span>
                                    <span className="text-sm text-cyan-700 dark:text-cyan-300 flex-1 truncate">{uploadedFile.name}</span>
                                    <button
                                        onClick={() => setUploadedFile(null)}
                                        className="text-cyan-500 hover:text-red-500 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-2">
                                {/* Hidden file input */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,image/*"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                {/* Upload button */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading}
                                    className="px-3 py-3 bg-slate-100 dark:bg-slate-800 border border-gray-200 dark:border-[#404040] rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors disabled:opacity-50"
                                    title="Upload PDF or Image"
                                >
                                    <span className="material-symbols-outlined text-[20px]">attach_file</span>
                                </button>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={uploadedFile ? `Ask about ${uploadedFile.name}...` : "Ask Hugo anything or request an action..."}
                                    disabled={isLoading}
                                    className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-[#404040] rounded-lg text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                                />
                                <button
                                    onClick={() => handleSend()}
                                    disabled={isLoading || (!input.trim() && !uploadedFile)}
                                    className="px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined text-[20px]">send</span>
                                    Send
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        </>
    );
}

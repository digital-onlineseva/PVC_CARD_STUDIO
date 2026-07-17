/* script.js */

// --- Constants & Configuration ---
const CONFIG = {
    DPI: 300,
    INCH_TO_MM: 25.4,
    PAPER: { widthInch: 4, heightInch: 6 },
    CARD: { widthMM: 55, heightMM: 91, topMarginMM: 2 }
};

// Calculate pixels based on DPI
const pxPerMM = CONFIG.DPI / CONFIG.INCH_TO_MM;
const PAPER_W = Math.round(CONFIG.PAPER.widthInch * CONFIG.DPI); // 1200
const PAPER_H = Math.round(CONFIG.PAPER.heightInch * CONFIG.DPI); // 1800
const CARD_W = Math.round(CONFIG.CARD.widthMM * pxPerMM); // ~650
const CARD_H = Math.round(CONFIG.CARD.heightMM * pxPerMM); // ~1075
const CARD_MARGIN_TOP = Math.round(CONFIG.CARD.topMarginMM * pxPerMM); // ~24
const CARD_X = Math.round((PAPER_W - CARD_W) / 2); // Center horizontally
const CARD_Y = CARD_MARGIN_TOP;

// --- Application State ---
let state = {
    image: null,
    zoom: 1,
    angle: 0,
    offsetX: 0,
    offsetY: 0,
    flipH: 1,
    flipV: 1,
    guidesVisible: true,
    bgType: 'transparent',
    bgColor: '#ffffff',
    viewScale: 1 // For workspace zoom
};

let historyStack = [];
let historyIndex = -1;
let isDragging = false;
let startDrag = { x: 0, y: 0 };

// --- DOM Elements ---
const DOM = {
    app: document.getElementById('app'),
    canvas: document.getElementById('editorCanvas'),
    ctx: document.getElementById('editorCanvas').getContext('2d', { alpha: false }),
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    
    // Controls
    zoomSlider: document.getElementById('zoomSlider'),
    zoomValue: document.getElementById('zoomValue'),
    btnRotLeft: document.getElementById('btnRotLeft'),
    btnRotRight: document.getElementById('btnRotRight'),
    btnFlipH: document.getElementById('btnFlipH'),
    btnFlipV: document.getElementById('btnFlipV'),
    
    btnUndo: document.getElementById('btnUndo'),
    btnRedo: document.getElementById('btnRedo'),
    btnReset: document.getElementById('btnReset'),
    btnPrint: document.getElementById('btnPrint'),
    
    toggleGuides: document.getElementById('toggleGuides'),
    themeToggle: document.getElementById('themeToggle'),
    
    bgRadios: document.getElementsByName('bgType'),
    bgColorGroup: document.getElementById('bgColorGroup'),
    bgColorPicker: document.getElementById('bgColorPicker'),
    
    // Workspace Toolbar
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnFitScreen: document.getElementById('btnFitScreen'),
    
    printImage: document.getElementById('printImage'),
    loaderOverlay: document.getElementById('loaderOverlay'),
    notificationContainer: document.getElementById('notificationContainer')
};

// --- Initialization ---
function init() {
    loadSettings();
    setupCanvas();
    attachEventListeners();
    render();
}

// --- LocalStorage ---
function loadSettings() {
    const saved = localStorage.getItem('pvcStudioSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            document.documentElement.setAttribute('data-theme', parsed.theme || 'dark');
            state.guidesVisible = parsed.guides !== undefined ? parsed.guides : true;
            DOM.toggleGuides.checked = state.guidesVisible;
        } catch (e) {
            console.error('Settings parse error', e);
        }
    }
}

function saveSettings() {
    const settings = {
        theme: document.documentElement.getAttribute('data-theme'),
        guides: state.guidesVisible
    };
    localStorage.setItem('pvcStudioSettings', JSON.stringify(settings));
}

// --- Canvas Setup ---
function setupCanvas() {
    // Set internal resolution strictly to 4x6 @ 300DPI
    DOM.canvas.width = PAPER_W;
    DOM.canvas.height = PAPER_H;
    
    // High quality rendering flags
    DOM.ctx.imageSmoothingEnabled = true;
    DOM.ctx.imageSmoothingQuality = 'high';
    
    fitToScreen();
}

function fitToScreen() {
    const container = DOM.canvas.parentElement;
    const padding = 80;
    const availableW = container.clientWidth - padding;
    const availableH = container.clientHeight - padding;
    
    const scaleW = availableW / PAPER_W;
    const scaleH = availableH / PAPER_H;
    
    state.viewScale = Math.min(scaleW, scaleH);
    applyViewScale();
}

function applyViewScale() {
    DOM.canvas.style.transform = `scale(${state.viewScale})`;
}

// --- History Management ---
function saveState() {
    // Keep max 20 states
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }
    
    const currentState = {
        zoom: state.zoom,
        angle: state.angle,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        flipH: state.flipH,
        flipV: state.flipV
    };
    
    historyStack.push(currentState);
    if (historyStack.length > 20) historyStack.shift();
    else historyIndex++;
    
    updateHistoryButtons();
}

function updateHistoryButtons() {
    DOM.btnUndo.disabled = historyIndex <= 0;
    DOM.btnRedo.disabled = historyIndex >= historyStack.length - 1;
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreState(historyStack[historyIndex]);
    }
}

function redo() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        restoreState(historyStack[historyIndex]);
    }
}

function restoreState(savedState) {
    state.zoom = savedState.zoom;
    state.angle = savedState.angle;
    state.offsetX = savedState.offsetX;
    state.offsetY = savedState.offsetY;
    state.flipH = savedState.flipH;
    state.flipV = savedState.flipV;
    
    DOM.zoomSlider.value = Math.round(state.zoom * 100);
    DOM.zoomValue.textContent = `${DOM.zoomSlider.value}%`;
    
    render();
}

// --- File Handling ---
function handleFileSelect(file) {
    if (!file || !file.type.match('image.*')) {
        showNotification('Invalid file type. Please upload an image.', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.image = img;
            DOM.fileInfo.textContent = file.name;
            resetImageTransforms();
            saveState(); // Initial state for undo
            showNotification('Image loaded successfully.', 'success');
        };
        img.onerror = () => showNotification('Error loading image.', 'error');
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function resetImageTransforms() {
    if (!state.image) return;
    
    // Auto Fit (Cover)
    const imgRatio = state.image.width / state.image.height;
    const cardRatio = CARD_W / CARD_H;
    
    let baseZoom = 1;
    if (imgRatio > cardRatio) {
        baseZoom = CARD_H / state.image.height;
    } else {
        baseZoom = CARD_W / state.image.width;
    }
    
    state.zoom = baseZoom;
    state.angle = 0;
    state.offsetX = 0;
    state.offsetY = 0;
    state.flipH = 1;
    state.flipV = 1;
    
    DOM.zoomSlider.value = Math.round(state.zoom * 100);
    DOM.zoomValue.textContent = `${DOM.zoomSlider.value}%`;
    
    render();
}

// --- Rendering Logic ---
function render() {
    const ctx = DOM.ctx;
    
    // 1. Draw Paper Background (White)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAPER_W, PAPER_H);
    
    // 2. Draw Card Background (if transparent, leave white paper, else draw color)
    if (state.bgType === 'color') {
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);
    }
    
    // 3. Draw Image with Clipping inside Card area
    if (state.image) {
        ctx.save();
        
        // Clip to card boundary
        ctx.beginPath();
        ctx.rect(CARD_X, CARD_Y, CARD_W, CARD_H);
        ctx.clip();
        
        // Center of card calculation for transforms
        const centerX = CARD_X + (CARD_W / 2);
        const centerY = CARD_Y + (CARD_H / 2);
        
        ctx.translate(centerX + state.offsetX, centerY + state.offsetY);
        ctx.rotate(state.angle * Math.PI / 180);
        ctx.scale(state.flipH, state.flipV);
        ctx.scale(state.zoom, state.zoom);
        
        // Draw image centered at the origin
        ctx.drawImage(
            state.image, 
            -state.image.width / 2, 
            -state.image.height / 2
        );
        
        ctx.restore();
    }
    
    // 4. Draw Guides
    if (state.guidesVisible) {
        drawGuides(ctx);
    }
}

function drawGuides(ctx) {
    const bleed = Math.round(2 * pxPerMM); // 2mm bleed
    const safe = Math.round(3 * pxPerMM); // 3mm safe margin
    
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    
    // Bleed (Red) - Outside working area (conceptual, drawing on border)
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.strokeRect(CARD_X - bleed, CARD_Y - bleed, CARD_W + (bleed*2), CARD_H + (bleed*2));
    
    // Trim/Working Area (Blue)
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
    ctx.strokeRect(CARD_X, CARD_Y, CARD_W, CARD_H);
    
    // Safe Area (Green)
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.strokeRect(CARD_X + safe, CARD_Y + safe, CARD_W - (safe*2), CARD_H - (safe*2));
    
    // Center Marks (Orange)
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)';
    ctx.setLineDash([]);
    ctx.beginPath();
    
    // Top
    ctx.moveTo(CARD_X + CARD_W/2, CARD_Y - 20);
    ctx.lineTo(CARD_X + CARD_W/2, CARD_Y + 20);
    // Bottom
    ctx.moveTo(CARD_X + CARD_W/2, CARD_Y + CARD_H - 20);
    ctx.lineTo(CARD_X + CARD_W/2, CARD_Y + CARD_H + 20);
    // Left
    ctx.moveTo(CARD_X - 20, CARD_Y + CARD_H/2);
    ctx.lineTo(CARD_X + 20, CARD_Y + CARD_H/2);
    // Right
    ctx.moveTo(CARD_X + CARD_W - 20, CARD_Y + CARD_H/2);
    ctx.lineTo(CARD_X + CARD_W + 20, CARD_Y + CARD_H/2);
    
    ctx.stroke();
}

// --- Event Listeners ---
function attachEventListeners() {
    // Theme Toggle
    DOM.themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        saveSettings();
    });

    // File Input & Drag/Drop
    DOM.dropZone.addEventListener('click', () => DOM.fileInput.click());
    
    DOM.fileInput.addEventListener('change', (e) => {
        if(e.target.files.length) handleFileSelect(e.target.files[0]);
    });
    
    DOM.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.add('dragover');
    });
    
    DOM.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
    });
    
    DOM.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
        if(e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
    });

    // Window Resize for Canvas Fitting
    window.addEventListener('resize', fitToScreen);

    // Workspace Zoom Controls
    DOM.btnZoomIn.addEventListener('click', () => { state.viewScale *= 1.2; applyViewScale(); });
    DOM.btnZoomOut.addEventListener('click', () => { state.viewScale /= 1.2; applyViewScale(); });
    DOM.btnFitScreen.addEventListener('click', fitToScreen);

    // Image Transformations
    DOM.zoomSlider.addEventListener('input', (e) => {
        if(!state.image) return;
        state.zoom = parseInt(e.target.value) / 100;
        DOM.zoomValue.textContent = `${e.target.value}%`;
        render();
    });
    DOM.zoomSlider.addEventListener('change', saveState);

    DOM.btnRotLeft.addEventListener('click', () => { if(!state.image) return; state.angle -= 90; render(); saveState(); });
    DOM.btnRotRight.addEventListener('click', () => { if(!state.image) return; state.angle += 90; render(); saveState(); });
    DOM.btnFlipH.addEventListener('click', () => { if(!state.image) return; state.flipH *= -1; render(); saveState(); });
    DOM.btnFlipV.addEventListener('click', () => { if(!state.image) return; state.flipV *= -1; render(); saveState(); });

    // Background Controls
    DOM.bgRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.bgType = e.target.value;
            DOM.bgColorGroup.style.display = state.bgType === 'color' ? 'block' : 'none';
            render();
            saveState();
        });
    });
    DOM.bgColorPicker.addEventListener('input', (e) => {
        state.bgColor = e.target.value;
        render();
    });
    DOM.bgColorPicker.addEventListener('change', saveState);

    // Guides Toggle
    DOM.toggleGuides.addEventListener('change', (e) => {
        state.guidesVisible = e.target.checked;
        saveSettings();
        render();
    });

    // Actions
    DOM.btnReset.addEventListener('click', () => {
        if(!state.image) return;
        resetImageTransforms();
        saveState();
        showNotification('Image reset.');
    });
    DOM.btnUndo.addEventListener('click', undo);
    DOM.btnRedo.addEventListener('click', redo);
    
    // Mouse Dragging on Canvas
    DOM.canvas.addEventListener('mousedown', (e) => {
        if (!state.image) return;
        isDragging = true;
        startDrag = { 
            x: e.clientX, 
            y: e.clientY,
            offX: state.offsetX,
            offY: state.offsetY
        };
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || !state.image) return;
        
        // Calculate delta taking view scale into account
        const dx = (e.clientX - startDrag.x) / state.viewScale;
        const dy = (e.clientY - startDrag.y) / state.viewScale;
        
        state.offsetX = startDrag.offX + dx;
        state.offsetY = startDrag.offY + dy;
        
        render();
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            saveState();
        }
    });

    // Print Handling
    DOM.btnPrint.addEventListener('click', preparePrint);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'p':
                case 's':
                    e.preventDefault();
                    preparePrint();
                    break;
                case 'o':
                    e.preventDefault();
                    DOM.fileInput.click();
                    break;
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) redo();
                    else undo();
                    break;
                case 'y':
                    e.preventDefault();
                    redo();
                    break;
            }
        }
    });
}

// --- Print Processing ---
function preparePrint() {
    if (!state.image) {
        showNotification('Please upload an image first.', 'error');
        return;
    }

    DOM.loaderOverlay.classList.remove('hidden');

    // Yield to browser to show loader
    setTimeout(() => {
        try {
            // Temporarily turn off guides for the final print
            const guidesState = state.guidesVisible;
            state.guidesVisible = false;
            render();
            
            // Extract full quality image
            const dataUrl = DOM.canvas.toDataURL('image/jpeg', 1.0);
            DOM.printImage.src = dataUrl;
            
            // Restore guides
            state.guidesVisible = guidesState;
            render();

            DOM.printImage.onload = () => {
                DOM.loaderOverlay.classList.add('hidden');
                // Trigger native print dialog which handles PDF saving
                window.print();
            };
        } catch (error) {
            DOM.loaderOverlay.classList.add('hidden');
            showNotification('Error preparing print.', 'error');
            console.error(error);
        }
    }, 100);
}

// --- Notification System ---
function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    DOM.notificationContainer.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-in forwards';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
}

// Boot application
init();

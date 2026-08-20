"use strict";

/*
    GamerXD_GZ Studio V1

    Client-side web development studio.

    Storage:
    IndexedDB

    Limits:
    - 20 files per project
    - 5,000 lines per file
    - 10 MB per project
    - 10 projects maximum

    No accounts or server required.
*/


const LIMITS = {
    maxFiles: 20,
    maxLines: 5000,
    maxProjectBytes: 10 * 1024 * 1024,
    maxProjects: 10,
    maxFileNameLength: 100,
    maxProjectNameLength: 80
};


const DB_NAME = "GamerXD_GZ_Studio";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";


let db = null;
let currentProject = null;
let currentFileName = "index.html";

let historyStack = [];
let redoStack = [];

let autosaveTimer = null;
let previewTimer = null;

let modalAction = null;


/* DOM */

const fileList = document.getElementById("fileList");
const codeEditor = document.getElementById("codeEditor");
const projectName = document.getElementById("projectName");
const currentFile = document.getElementById("currentFile");
const lineCount = document.getElementById("lineCount");
const lineNumbers = document.getElementById("lineNumbers");
const saveStatus = document.getElementById("saveStatus");
const limitsStatus = document.getElementById("limitsStatus");
const preview = document.getElementById("preview");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalDescription = document.getElementById("modalDescription");
const modalInput = document.getElementById("modalInput");
const modalCancel = document.getElementById("modalCancel");
const modalConfirm = document.getElementById("modalConfirm");

const toastContainer = document.getElementById("toastContainer");

const newProjectBtn = document.getElementById("newProjectBtn");
const importBtn = document.getElementById("importBtn");
const downloadBtn = document.getElementById("downloadBtn");

const addFileBtn = document.getElementById("addFileBtn");
const renameFileBtn = document.getElementById("renameFileBtn");
const downloadFileBtn = document.getElementById("downloadFileBtn");
const deleteFileBtn = document.getElementById("deleteFileBtn");
const deleteProjectBtn = document.getElementById("deleteProjectBtn");

const saveBtn = document.getElementById("saveBtn");
const runBtn = document.getElementById("runBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const refreshPreviewBtn = document.getElementById("refreshPreviewBtn");

const fileInput = document.getElementById("fileInput");


/* DATABASE */

function openDatabase() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(
            DB_NAME,
            DB_VERSION
        );

        request.onupgradeneeded = () => {

            const database = request.result;

            if (!database.objectStoreNames.contains(PROJECT_STORE)) {

                database.createObjectStore(
                    PROJECT_STORE,
                    {
                        keyPath: "id"
                    }
                );
            }
        };

        request.onsuccess = () => {

            db = request.result;

            resolve(db);
        };

        request.onerror = () => {

            reject(request.error);
        };
    });
}


function getAllProjects() {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            PROJECT_STORE,
            "readonly"
        );

        const store = transaction.objectStore(
            PROJECT_STORE
        );

        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}


function getProject(id) {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            PROJECT_STORE,
            "readonly"
        );

        const store = transaction.objectStore(
            PROJECT_STORE
        );

        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}


function putProject(project) {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            PROJECT_STORE,
            "readwrite"
        );

        const store = transaction.objectStore(
            PROJECT_STORE
        );

        const request = store.put(project);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}


function deleteProjectFromDB(id) {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            PROJECT_STORE,
            "readwrite"
        );

        const store = transaction.objectStore(
            PROJECT_STORE
        );

        const request = store.delete(id);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}


/* PROJECT CREATION */

function createDefaultProject(name = "My Project") {

    return {
        id: crypto.randomUUID(),

        name,

        createdAt: Date.now(),

        updatedAt: Date.now(),

        files: {

            "index.html": {
                content:
`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Project</title>
    <link rel="stylesheet" href="style.css">
</head>

<body>

    <h1>Hello from GamerXD_GZ Studio</h1>

    <p>Start building your project.</p>

    <script src="script.js"></script>
</body>
</html>`
            },

            "style.css": {
                content:
`body {
    margin: 0;
    min-height: 100vh;

    display: grid;
    place-items: center;

    background: #10141c;
    color: white;

    font-family: Arial, sans-serif;
}

h1 {
    font-size: 40px;
}`
            },

            "script.js": {
                content:
`console.log("GamerXD_GZ Studio project loaded.");`
            }
        },

        recovery: []
    };
}


/* STARTUP */

async function initialize() {

    try {

        await openDatabase();

        const projects = await getAllProjects();

        if (projects.length === 0) {

            currentProject =
                createDefaultProject();

            await putProject(currentProject);

        } else {

            currentProject = projects[0];
        }

        projectName.value =
            currentProject.name;

        currentFileName =
            Object.keys(
                currentProject.files
            )[0] || "index.html";

        renderFileList();
        loadCurrentFile();
        updateLimits();
        updatePreview();

        setStatus("Saved locally");

    } catch (error) {

        console.error(error);

        showToast(
            "Unable to open local project storage.",
            true
        );
    }
}


/* SAVE */

async function saveProject() {

    if (!currentProject) {
        return;
    }

    saveCurrentFileContent();

    currentProject.name =
        cleanProjectName(
            projectName.value
        );

    currentProject.updatedAt =
        Date.now();

    const valid =
        validateProject(
            currentProject
        );

    if (!valid.ok) {

        showToast(valid.message, true);

        return false;
    }

    try {

        await putProject(currentProject);

        setStatus(
            `Saved ${formatTime(
                currentProject.updatedAt
            )}`
        );

        return true;

    } catch (error) {

        console.error(error);

        showToast(
            "Could not save project.",
            true
        );

        return false;
    }
}


function scheduleAutosave() {

    clearTimeout(autosaveTimer);

    setStatus("Unsaved changes");

    autosaveTimer = setTimeout(
        async () => {

            await saveProject();

            updatePreview();

        },
        500
    );
}


function saveCurrentFileContent() {

    if (!currentProject) {
        return;
    }

    if (!currentProject.files[currentFileName]) {
        return;
    }

    const content =
        codeEditor.value;

    const lines =
        countLines(content);

    if (lines > LIMITS.maxLines) {

        codeEditor.value =
            trimToLineLimit(
                content,
                LIMITS.maxLines
            );

        showToast(
            `Maximum ${LIMITS.maxLines.toLocaleString()} lines per file.`,
            true
        );
    }

    currentProject.files[currentFileName].content =
        codeEditor.value;
}


/* FILES */

function renderFileList() {

    fileList.innerHTML = "";

    if (!currentProject) {
        return;
    }

    const names =
        Object.keys(
            currentProject.files
        );

    names.sort((a, b) => {

        if (a === "index.html") {
            return -1;
        }

        if (b === "index.html") {
            return 1;
        }

        return a.localeCompare(b);
    });

    for (const name of names) {

        const button =
            document.createElement("button");

        button.className =
            "file-item";

        if (name === currentFileName) {
            button.classList.add("active");
        }

        const icon =
            document.createElement("span");

        icon.className =
            "file-icon";

        icon.textContent =
            getFileIcon(name);

        const label =
            document.createElement("span");

        label.className =
            "file-name";

        label.textContent =
            name;

        button.appendChild(icon);
        button.appendChild(label);

        button.addEventListener(
            "click",
            () => openFile(name)
        );

        fileList.appendChild(button);
    }

    updateLimits();
}


function openFile(name) {

    saveCurrentFileContent();

    currentFileName = name;

    historyStack = [];
    redoStack = [];

    loadCurrentFile();

    renderFileList();

    updatePreview();
}


function loadCurrentFile() {

    if (!currentProject) {
        return;
    }

    const file =
        currentProject.files[
            currentFileName
        ];

    if (!file) {
        return;
    }

    codeEditor.value =
        file.content || "";

    currentFile.textContent =
        currentFileName;

    updateLineInfo();

    updateLineNumbers();

    saveStatus.textContent =
        "Saved locally";
}


async function createFile() {

    if (!currentProject) {
        return;
    }

    const count =
        Object.keys(
            currentProject.files
        ).length;

    if (count >= LIMITS.maxFiles) {

        showToast(
            `You can have a maximum of ${LIMITS.maxFiles} files per project.`,
            true
        );

        return;
    }

    openModal(
        "Create File",
        "Enter the name of the new file.",
        "",
        async name => {

            const validName =
                validateFileName(name);

            if (!validName.ok) {

                showToast(
                    validName.message,
                    true
                );

                return;
            }

            if (
                currentProject.files[
                    validName.name
                ]
            ) {

                showToast(
                    "That file already exists.",
                    true
                );

                return;
            }

            currentProject.files[
                validName.name
            ] = {
                content: getStarterContent(
                    validName.name
                )
            };

            currentFileName =
                validName.name;

            await saveProject();

            renderFileList();
            loadCurrentFile();
            updatePreview();

            showToast(
                `Created ${validName.name}`
            );
        }
    );
}


async function renameFile() {

    if (!currentProject) {
        return;
    }

    const oldName =
        currentFileName;

    openModal(
        "Rename File",
        "Enter the new file name.",
        oldName,
        async name => {

            const validName =
                validateFileName(name);

            if (!validName.ok) {

                showToast(
                    validName.message,
                    true
                );

                return;
            }

            if (
                validName.name !== oldName &&
                currentProject.files[
                    validName.name
                ]
            ) {

                showToast(
                    "That file already exists.",
                    true
                );

                return;
            }

            const content =
                currentProject.files[
                    oldName
                ].content;

            delete currentProject.files[
                oldName
            ];

            currentProject.files[
                validName.name
            ] = {
                content
            };

            currentFileName =
                validName.name;

            await saveProject();

            renderFileList();
            loadCurrentFile();
            updatePreview();

            showToast(
                `Renamed to ${validName.name}`
            );
        }
    );
}


async function deleteFile() {

    if (!currentProject) {
        return;
    }

    const names =
        Object.keys(
            currentProject.files
        );

    if (names.length <= 1) {

        showToast(
            "A project must contain at least one file.",
            true
        );

        return;
    }

    const target =
        currentFileName;

    const confirmed =
        window.confirm(
            `Delete "${target}"?\n\nA recovery copy will be created first.`
        );

    if (!confirmed) {
        return;
    }

    createRecoverySnapshot();

    delete currentProject.files[
        target
    ];

    currentFileName =
        Object.keys(
            currentProject.files
        )[0];

    await saveProject();

    renderFileList();
    loadCurrentFile();
    updatePreview();

    showToast(
        `Deleted ${target}`
    );
}


/* PROJECTS */

async function createProject() {

    const projects =
        await getAllProjects();

    if (
        projects.length >=
        LIMITS.maxProjects
    ) {

        showToast(
            `You can have a maximum of ${LIMITS.maxProjects} projects.`,
            true
        );

        return;
    }

    openModal(
        "New Project",
        "Enter a name for your new project.",
        "My Project",
        async name => {

            const clean =
                cleanProjectName(name);

            if (!clean) {

                showToast(
                    "Enter a project name.",
                    true
                );

                return;
            }

            const project =
                createDefaultProject(
                    clean
                );

            await putProject(project);

            currentProject =
                project;

            currentFileName =
                "index.html";

            projectName.value =
                project.name;

            historyStack = [];
            redoStack = [];

            renderFileList();
            loadCurrentFile();
            updatePreview();

            showToast(
                "New project created."
            );
        }
    );
}


async function deleteProject() {

    if (!currentProject) {
        return;
    }

    const confirmed =
        window.confirm(
            `Delete "${currentProject.name}"?\n\nA recovery copy will be kept in this browser before deletion.`
        );

    if (!confirmed) {
        return;
    }

    createRecoverySnapshot();

    await saveProject();

    await deleteProjectFromDB(
        currentProject.id
    );

    const projects =
        await getAllProjects();

    if (projects.length === 0) {

        currentProject =
            createDefaultProject();

        await putProject(
            currentProject
        );

    } else {

        currentProject =
            projects[0];
    }

    currentFileName =
        Object.keys(
            currentProject.files
        )[0];

    projectName.value =
        currentProject.name;

    renderFileList();
    loadCurrentFile();
    updatePreview();

    showToast(
        "Project deleted."
    );
}


/* PROJECT VALIDATION */

function validateProject(project) {

    const files =
        Object.entries(
            project.files
        );

    if (
        files.length >
        LIMITS.maxFiles
    ) {

        return {
            ok: false,
            message:
                `Maximum ${LIMITS.maxFiles} files allowed.`
        };
    }

    let totalBytes = 0;

    for (const [name, file] of files) {

        const lines =
            countLines(
                file.content
            );

        if (
            lines >
            LIMITS.maxLines
        ) {

            return {
                ok: false,
                message:
                    `"${name}" exceeds the ${LIMITS.maxLines.toLocaleString()} line limit.`
            };
        }

        totalBytes +=
            new Blob([
                file.content
            ]).size;
    }

    if (
        totalBytes >
        LIMITS.maxProjectBytes
    ) {

        return {
            ok: false,
            message:
                "This project exceeds the 10 MB project limit."
        };
    }

    return {
        ok: true
    };
}


function validateFileName(name) {

    const clean =
        String(name || "")
            .trim();

    if (!clean) {

        return {
            ok: false,
            message: "Enter a file name."
        };
    }

    if (
        clean.length >
        LIMITS.maxFileNameLength
    ) {

        return {
            ok: false,
            message:
                `File names can be at most ${LIMITS.maxFileNameLength} characters.`
        };
    }

    if (
        clean.includes("/") ||
        clean.includes("\\") ||
        clean.includes("..")
    ) {

        return {
            ok: false,
            message:
                "Invalid file name."
        };
    }

    if (
        !/\.(html?|css|js|json|txt|svg|md)$/i.test(
            clean
        )
    ) {

        return {
            ok: false,
            message:
                "Allowed files: HTML, CSS, JS, JSON, TXT, SVG, and MD."
        };
    }

    return {
        ok: true,
        name: clean
    };
}


function cleanProjectName(name) {

    return String(name || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(
            0,
            LIMITS.maxProjectNameLength
        );
}


/* RECOVERY */

function createRecoverySnapshot() {

    if (!currentProject) {
        return;
    }

    if (!Array.isArray(
        currentProject.recovery
    )) {

        currentProject.recovery = [];
    }

    const snapshot = {
        createdAt: Date.now(),

        name: currentProject.name,

        files:
            JSON.parse(
                JSON.stringify(
                    currentProject.files
                )
            )
    };

    currentProject.recovery.unshift(
        snapshot
    );

    currentProject.recovery =
        currentProject.recovery.slice(
            0,
            5
        );
}


/* EDITOR HISTORY */

function addHistory(content) {

    if (
        historyStack.length > 100
    ) {

        historyStack.shift();
    }

    historyStack.push(content);

    redoStack = [];
}


function undo() {

    if (
        historyStack.length === 0
    ) {

        return;
    }

    const previous =
        historyStack.pop();

    redoStack.push(
        codeEditor.value
    );

    codeEditor.value =
        previous;

    saveCurrentFileContent();

    updateLineInfo();
    updateLineNumbers();

    scheduleAutosave();
    updatePreview();
}


function redo() {

    if (
        redoStack.length === 0
    ) {

        return;
    }

    const next =
        redoStack.pop();

    historyStack.push(
        codeEditor.value
    );

    codeEditor.value =
        next;

    saveCurrentFileContent();

    updateLineInfo();
    updateLineNumbers();

    scheduleAutosave();
    updatePreview();
}


/* PREVIEW */

function updatePreview() {

    clearTimeout(
        previewTimer
    );

    previewTimer =
        setTimeout(
            renderPreview,
            200
        );
}


function renderPreview() {

    if (!currentProject) {
        return;
    }

    saveCurrentFileContent();

    let html =
        currentProject.files[
            "index.html"
        ]?.content;

    if (!html) {

        html =
`<!DOCTYPE html>
<html>
<body>
    <h1>No index.html found</h1>
</body>
</html>`;
    }

    const css =
        currentProject.files[
            "style.css"
        ]?.content || "";

    const js =
        currentProject.files[
            "script.js"
        ]?.content || "";

    const basePath =
        getBasePath();

    html =
        injectStyles(
            html,
            css
        );

    html =
        injectScript(
            html,
            js
        );

    html =
        injectBase(
            html,
            basePath
        );

    preview.srcdoc =
        html;
}


function injectStyles(html, css) {

    if (!css) {
        return html;
    }

    const style =
        `<style>${css}</style>`;

    if (
        /<\/head>/i.test(html)
    ) {

        return html.replace(
            /<\/head>/i,
            `${style}</head>`
        );
    }

    return `${style}${html}`;
}


function injectScript(html, js) {

    if (!js) {
        return html;
    }

    const script =
        `<script>${js.replace(
            /<\/script/gi,
            "<\\/script"
        )}<\/script>`;

    if (
        /<\/body>/i.test(html)
    ) {

        return html.replace(
            /<\/body>/i,
            `${script}</body>`
        );
    }

    return `${html}${script}`;
}


function injectBase(html, basePath) {

    if (!basePath) {
        return html;
    }

    const base =
        `<base href="${escapeHtmlAttribute(
            basePath
        )}">`;

    if (
        /<head[^>]*>/i.test(html)
    ) {

        return html.replace(
            /<head[^>]*>/i,
            match => `${match}${base}`
        );
    }

    return base + html;
}


/* DOWNLOAD */

async function downloadProject() {

    if (!currentProject) {
        return;
    }

    saveCurrentFileContent();

    if (
        typeof JSZip === "undefined"
    ) {

        showToast(
            "ZIP support could not be loaded.",
            true
        );

        return;
    }

    const zip =
        new JSZip();

    for (
        const [name, file]
        of Object.entries(
            currentProject.files
        )
    ) {

        zip.file(
            name,
            file.content
        );
    }

    const blob =
        await zip.generateAsync({
            type: "blob"
        });

    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        `${safeDownloadName(
            currentProject.name
        )}.zip`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    showToast(
        "Project downloaded."
    );
}


function downloadCurrentFile() {

    if (!currentProject) {
        return;
    }

    saveCurrentFileContent();

    const file =
        currentProject.files[
            currentFileName
        ];

    if (!file) {
        return;
    }

    const blob =
        new Blob(
            [file.content],
            {
                type:
                    getMimeType(
                        currentFileName
                    )
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        currentFileName;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    showToast(
        `${currentFileName} downloaded.`
    );
}


/* IMPORT */

async function importProject(file) {

    if (!file) {
        return;
    }

    if (
        typeof JSZip === "undefined"
    ) {

        showToast(
            "ZIP support could not be loaded.",
            true
        );

        return;
    }

    if (
        file.size >
        LIMITS.maxProjectBytes
    ) {

        showToast(
            "The ZIP is larger than 10 MB.",
            true
        );

        return;
    }

    try {

        const zip =
            await JSZip.loadAsync(
                file
            );

        const importedFiles = {};

        for (
            const zipEntry
            of Object.values(
                zip.files
            )
        ) {

            if (
                zipEntry.dir
            ) {
                continue;
            }

            const cleanPath =
                normalizeImportedPath(
                    zipEntry.name
                );

            if (!cleanPath) {
                continue;
            }

            if (
                Object.keys(
                    importedFiles
                ).length >=
                LIMITS.maxFiles
            ) {

                showToast(
                    `Import limited to ${LIMITS.maxFiles} files.`,
                    true
                );

                break;
            }

            const content =
                await zipEntry.async(
                    "string"
                );

            if (
                countLines(content) >
                LIMITS.maxLines
            ) {

                showToast(
                    `${cleanPath} exceeds the line limit and was skipped.`,
                    true
                );

                continue;
            }

            importedFiles[
                cleanPath
            ] = {
                content
            };
        }

        if (
            Object.keys(
                importedFiles
            ).length === 0
        ) {

            showToast(
                "No supported files were found.",
                true
            );

            return;
        }

        const projects =
            await getAllProjects();

        if (
            projects.length >=
            LIMITS.maxProjects
        ) {

            showToast(
                `You already have ${LIMITS.maxProjects} projects.`,
                true
            );

            return;
        }

        const name =
            file.name
                .replace(
                    /\.zip$/i,
                    ""
                )
                .slice(
                    0,
                    LIMITS.maxProjectNameLength
                );

        const project = {

            id: crypto.randomUUID(),

            name:
                name ||
                "Imported Project",

            createdAt: Date.now(),

            updatedAt: Date.now(),

            files:
                importedFiles,

            recovery: []
        };

        const validation =
            validateProject(
                project
            );

        if (!validation.ok) {

            showToast(
                validation.message,
                true
            );

            return;
        }

        await putProject(
            project
        );

        currentProject =
            project;

        currentFileName =
            importedFiles[
                "index.html"
            ]
                ? "index.html"
                : Object.keys(
                    importedFiles
                )[0];

        projectName.value =
            currentProject.name;

        renderFileList();
        loadCurrentFile();
        updatePreview();

        showToast(
            "Project imported successfully."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "The ZIP could not be imported.",
            true
        );
    }
}


/* EDITOR EVENTS */

codeEditor.addEventListener(
    "input",
    () => {

        const content =
            codeEditor.value;

        if (
            countLines(content) >
            LIMITS.maxLines
        ) {

            codeEditor.value =
                trimToLineLimit(
                    content,
                    LIMITS.maxLines
                );

            showToast(
                `Maximum ${LIMITS.maxLines.toLocaleString()} lines per file.`,
                true
            );
        }

        saveCurrentFileContent();

        updateLineInfo();
        updateLineNumbers();

        scheduleAutosave();
        updatePreview();
    }
);


codeEditor.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Tab"
        ) {

            event.preventDefault();

            const start =
                codeEditor.selectionStart;

            const end =
                codeEditor.selectionEnd;

            const value =
                codeEditor.value;

            codeEditor.value =
                value.slice(
                    0,
                    start
                ) +
                "    " +
                value.slice(end);

            codeEditor.selectionStart =
                codeEditor.selectionEnd =
                    start + 4;

            saveCurrentFileContent();

            updateLineInfo();
            updateLineNumbers();

            scheduleAutosave();
            updatePreview();
        }

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() === "s"
        ) {

            event.preventDefault();

            saveProject();
            updatePreview();
        }

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() === "z"
        ) {

            event.preventDefault();

            undo();
        }

        if (
            (event.ctrlKey ||
                event.metaKey) &&
            event.key.toLowerCase() === "y"
        ) {

            event.preventDefault();

            redo();
        }
    }
);


codeEditor.addEventListener(
    "scroll",
    () => {

        lineNumbers.scrollTop =
            codeEditor.scrollTop;
    }
);


/* PROJECT NAME */

projectName.addEventListener(
    "input",
    () => {

        const clean =
            cleanProjectName(
                projectName.value
            );

        if (
            projectName.value !== clean
        ) {

            projectName.value =
                clean;
        }

        currentProject.name =
            clean || "My Project";

        scheduleAutosave();
    }
);


/* BUTTON EVENTS */

newProjectBtn.addEventListener(
    "click",
    createProject
);

addFileBtn.addEventListener(
    "click",
    createFile
);

renameFileBtn.addEventListener(
    "click",
    renameFile
);

downloadFileBtn.addEventListener(
    "click",
    downloadCurrentFile
);

deleteFileBtn.addEventListener(
    "click",
    deleteFile
);

deleteProjectBtn.addEventListener(
    "click",
    deleteProject
);

downloadBtn.addEventListener(
    "click",
    downloadProject
);

importBtn.addEventListener(
    "click",
    () => {
        fileInput.click();
    }
);

fileInput.addEventListener(
    "change",
    async () => {

        const file =
            fileInput.files[0];

        await importProject(file);

        fileInput.value = "";
    }
);

saveBtn.addEventListener(
    "click",
    async () => {

        const saved =
            await saveProject();

        if (saved) {

            updatePreview();

            showToast(
                "Saved."
            );
        }
    }
);

runBtn.addEventListener(
    "click",
    () => {

        saveCurrentFileContent();

        updatePreview();

        showToast(
            "Preview updated."
        );
    }
);

refreshPreviewBtn.addEventListener(
    "click",
    () => {

        updatePreview();

        showToast(
            "Preview refreshed."
        );
    }
);

undoBtn.addEventListener(
    "click",
    undo
);

redoBtn.addEventListener(
    "click",
    redo
);


/* MODAL */

function openModal(
    title,
    description,
    value,
    action
) {

    modalTitle.textContent =
        title;

    modalDescription.textContent =
        description;

    modalInput.value =
        value || "";

    modalAction =
        action;

    modal.classList.remove(
        "hidden"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    setTimeout(
        () => {
            modalInput.focus();
            modalInput.select();
        },
        20
    );
}


function closeModal() {

    modal.classList.add(
        "hidden"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    modalAction = null;
}


modalCancel.addEventListener(
    "click",
    closeModal
);


modalConfirm.addEventListener(
    "click",
    async () => {

        if (!modalAction) {
            return;
        }

        const action =
            modalAction;

        closeModal();

        await action(
            modalInput.value.trim()
        );
    }
);


modalInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            modalConfirm.click();
        }

        if (
            event.key === "Escape"
        ) {

            closeModal();
        }
    }
);


modal.addEventListener(
    "click",
    event => {

        if (
            event.target === modal
        ) {

            closeModal();
        }
    }
);


/* PAGE EXIT SAFETY */

window.addEventListener(
    "beforeunload",
    () => {

        if (!currentProject) {
            return;
        }

        saveCurrentFileContent();

        currentProject.updatedAt =
            Date.now();

        /*
            IndexedDB writes are asynchronous,
            so normal autosaves should already
            have completed before leaving.
        */
    }
);


/* HELPERS */

function countLines(text) {

    if (!text) {
        return 0;
    }

    return text.split("\n").length;
}


function trimToLineLimit(
    text,
    maxLines
) {

    return text
        .split("\n")
        .slice(
            0,
            maxLines
        )
        .join("\n");
}


function updateLineInfo() {

    const count =
        countLines(
            codeEditor.value
        );

    lineCount.textContent =
        `${count.toLocaleString()} lines`;
}


function updateLineNumbers() {

    const count =
        Math.max(
            1,
            countLines(
                codeEditor.value
            )
        );

    const numbers =
        Array.from(
            {
                length: count
            },
            (_, index) =>
                index + 1
        ).join("\n");

    lineNumbers.textContent =
        numbers;
}


function updateLimits() {

    if (!currentProject) {
        return;
    }

    const count =
        Object.keys(
            currentProject.files
        ).length;

    limitsStatus.textContent =
        `${count} / ${LIMITS.maxFiles} files`;
}


function setStatus(text) {

    saveStatus.textContent =
        text;
}


function showToast(
    message,
    error = false
) {

    const toast =
        document.createElement("div");

    toast.className =
        "toast";

    if (error) {

        toast.style.borderColor =
            "rgba(255, 98, 111, 0.4)";

        toast.style.color =
            "#ff9ba2";
    }

    toast.textContent =
        message;

    toastContainer.appendChild(
        toast
    );

    setTimeout(
        () => {

            toast.remove();

        },
        3000
    );
}


function getFileIcon(name) {

    const extension =
        name
            .split(".")
            .pop()
            .toLowerCase();

    if (extension === "html") {
        return "HTML";
    }

    if (extension === "css") {
        return "CSS";
    }

    if (extension === "js") {
        return "JS";
    }

    if (extension === "json") {
        return "JSON";
    }

    if (extension === "svg") {
        return "SVG";
    }

    return "FILE";
}


function getStarterContent(name) {

    const extension =
        name
            .split(".")
            .pop()
            .toLowerCase();

    if (extension === "html") {

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Page</title>
</head>

<body>

    <h1>New Page</h1>

</body>
</html>`;
    }

    if (extension === "css") {

        return `body {
    margin: 0;
    font-family: Arial, sans-serif;
}`;
    }

    if (extension === "js") {

        return `console.log("Hello from GamerXD_GZ Studio");`;
    }

    if (extension === "json") {

        return `{
    "name": "My Project"
}`;
    }

    if (extension === "svg") {

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
</svg>`;
    }

    return "";
}


function getBasePath() {

    const html =
        currentProject?.files[
            "index.html"
        ]?.content || "";

    const matches =
        html.match(
            /<base\s+href=["']([^"']+)["']/i
        );

    return matches
        ? matches[1]
        : "";
}


function normalizeImportedPath(path) {

    let clean =
        String(path || "")
            .replace(/\\/g, "/")
            .replace(/^\/+/, "");

    const parts =
        clean
            .split("/")
            .filter(
                part =>
                    part &&
                    part !== "." &&
                    part !== ".."
            );

    if (
        parts.length === 0
    ) {
        return null;
    }

    clean =
        parts.join("/");

    if (
        clean.length >
        LIMITS.maxFileNameLength
    ) {
        return null;
    }

    const filename =
        parts[parts.length - 1];

    if (
        !/\.(html?|css|js|json|txt|svg|md)$/i.test(
            filename
        )
    ) {
        return null;
    }

    return clean;
}


function safeDownloadName(name) {

    return String(name || "project")
        .replace(
            /[^a-zA-Z0-9._-]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            ""
        )
        .slice(
            0,
            80
        ) || "project";
}


function getMimeType(name) {

    const extension =
        name
            .split(".")
            .pop()
            .toLowerCase();

    const types = {
        html: "text/html",
        htm: "text/html",
        css: "text/css",
        js: "text/javascript",
        json: "application/json",
        txt: "text/plain",
        svg: "image/svg+xml",
        md: "text/markdown"
    };

    return (
        types[extension] ||
        "application/octet-stream"
    );
}


function escapeHtmlAttribute(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        );
}


function formatTime(timestamp) {

    return new Date(
        timestamp
    ).toLocaleTimeString(
        [],
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );
}


/* INITIALIZE */

initialize();
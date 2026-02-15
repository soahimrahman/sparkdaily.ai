/* =========================
   tasks.js (FULL)
   - LocalStorage CRUD
   - Add/Edit Task modal
   - Filters (search/status/priority/when)
   - Progress chips + progress bar
   - Date min=today + block past datetime (no spam)
   - Time picker modal (quick select + manual HH:MM digits only)
   - Profile menu (3 dots) fixed positioning (never goes off-screen)
   ========================= */

document.addEventListener("DOMContentLoaded", () => {
  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = "dr_tasks_v1";

  const uid = () =>
    "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  const pad2 = (n) => String(n).padStart(2, "0");

  const todayYMD = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const nowHHMM = () => {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function safeText(s) {
    return (s ?? "").toString();
  }

  function normalizeTimeStr(str) {
    const s = (str || "").trim();
    if (!s) return "";
    // Accept 9:5 -> 09:05
    const m = s.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
    if (!m) return "";
    let hh = Number(m[1]);
    let mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return "";
    if (hh < 0 || hh > 23) return "";
    if (mm < 0 || mm > 59) return "";
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  function formatDueDisplay(task) {
    // show "Mon, Feb 16, 01:05 AM" or "No due date"
    if (!task.dueDate) return "No due date";
    const time = task.dueTime || "00:00";
    const d = new Date(`${task.dueDate}T${time}`);
    if (Number.isNaN(d.getTime())) return "Invalid date";
    const datePart = d.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = task.dueTime
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    return timePart ? `${datePart}, ${timePart}` : datePart;
  }

  function dueAsDate(task) {
    if (!task.dueDate) return null;
    const time = task.dueTime || "00:00";
    const d = new Date(`${task.dueDate}T${time}`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function isOverdue(task) {
    const d = dueAsDate(task);
    if (!d) return false;
    return d.getTime() < Date.now();
  }

  function isToday(task) {
    if (!task.dueDate) return false;
    return task.dueDate === todayYMD();
  }

  function priorityLabel(p) {
    if (p === "high") return "HIGH";
    if (p === "low") return "LOW";
    return "MED";
  }

  function statusLabel(s) {
    if (s === "doing") return "DOING";
    if (s === "done") return "DONE";
    return "TODO";
  }

  /* ---------- elements (must exist) ---------- */
  const tasksList = $("tasksList");
  const tasksEmpty = $("tasksEmpty");
  const tasksCount = $("tasksCount");

  const searchInput = $("searchInput");
  const filterStatus = $("filterStatus");
  const filterPriority = $("filterPriority");
  const filterWhen = $("filterWhen");

  const btnAddTask = $("btnAddTask");
  const taskModal = $("taskModal");
  const btnCloseTaskModal = $("btnCloseTaskModal");
  const btnCancelTask = $("btnCancelTask");
  const btnSaveTask = $("btnSaveTask");

  const tTitle = $("tTitle");
  const tPriority = $("tPriority");
  const tStatus = $("tStatus");
  const tDueDate = $("tDueDate");
  const tCategory = $("tCategory");
  const tNotes = $("tNotes");
  const tProgress = $("tProgress");

  // time picker UI
  const btnOpenTime = $("btnOpenTime");
  const btnClearTime = $("btnClearTime");
  const timeLabel = $("timeLabel");
  const tDueTimeHidden = $("tDueTime"); // hidden input in HTML

  const timeModal = $("timeModal");
  const btnCloseTime = $("btnCloseTime");
  const timeSelect = $("timeSelect");
  const timeManualInside = $("timeManualInside");
  const btnTimeNow = $("btnTimeNow");
  const btnTimeApply = $("btnTimeApply");

  // profile menu (sidebar bottom)
  const btnProfileMenu = $("btnProfileMenu");
  const profileMenu = $("profileMenu");

  /* ---------- required IDs check (no btnClearCompleted anymore) ---------- */
  const requiredIds = [
    "tasksList",
    "tasksEmpty",
    "tasksCount",
    "searchInput",
    "filterStatus",
    "filterPriority",
    "filterWhen",
    "btnAddTask",
    "taskModal",
    "btnCloseTaskModal",
    "btnCancelTask",
    "btnSaveTask",
    "tTitle",
    "tPriority",
    "tStatus",
    "tDueDate",
    "tCategory",
    "tNotes",
    "tProgress",
    "btnOpenTime",
    "btnClearTime",
    "timeLabel",
    "tDueTime",
    "timeModal",
    "btnCloseTime",
    "timeSelect",
    "timeManualInside",
    "btnTimeNow",
    "btnTimeApply",
  ];

  const missing = requiredIds.filter((id) => !$(id));
  if (missing.length) {
    alert("Tasks page error: Missing IDs:\n" + missing.join(", "));
    return;
  }

  /* ---------- modal helpers ---------- */
  function openTaskModal() {
    taskModal.classList.remove("hidden");
    taskModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    tTitle.focus();
  }

  function closeTaskModal() {
    taskModal.classList.add("hidden");
    taskModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  // If you still have inline modal JS in HTML, this won’t break it.
  btnAddTask.addEventListener("click", () => {
    startCreate();
    openTaskModal();
  });

  btnCloseTaskModal.addEventListener("click", closeTaskModal);
  btnCancelTask.addEventListener("click", closeTaskModal);

  taskModal.addEventListener("click", (e) => {
    if (e.target === taskModal) closeTaskModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!taskModal.classList.contains("hidden")) closeTaskModal();
      if (!timeModal.classList.contains("hidden")) closeTimeModal();
      closeProfileMenu();
    }
  });

  /* ---------- state ---------- */
  let tasks = loadTasks();
  let editingId = null;

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      // sanitize
      return arr.map((t) => ({
        id: t.id || uid(),
        title: safeText(t.title).slice(0, 200),
        priority: ["high", "med", "low"].includes(t.priority) ? t.priority : "med",
        status: ["todo", "doing", "done"].includes(t.status) ? t.status : "todo",
        dueDate: safeText(t.dueDate),
        dueTime: normalizeTimeStr(t.dueTime),
        category: safeText(t.category).slice(0, 60),
        notes: safeText(t.notes).slice(0, 240),
        progress: clamp(Number(t.progress || 0), 0, 100),
        createdAt: t.createdAt || Date.now(),
        updatedAt: t.updatedAt || Date.now(),
      }));
    } catch {
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  /* ---------- no past due rule (no spam) ---------- */
  tDueDate.min = todayYMD();

  let lastDueWarnAt = 0;
  function warnOnce(msg) {
    const now = Date.now();
    if (now - lastDueWarnAt < 2000) return; // 2s cooldown
    lastDueWarnAt = now;
    alert(msg);
  }

  function validateNoPastDue({ silent = false } = {}) {
    const date = (tDueDate.value || "").trim(); // YYYY-MM-DD
    const time = (tDueTimeHidden.value || "").trim(); // HH:MM or ""
    if (!date) return true; // allow empty due date

    const timePart = time || "00:00";
    const chosen = new Date(`${date}T${timePart}`);
    if (Number.isNaN(chosen.getTime())) return true;

    const now = new Date();

    if (chosen.getTime() < now.getTime()) {
      if (!silent) warnOnce("You can’t select a past date/time.");
      return false;
    }
    return true;
  }

  tDueDate.addEventListener("change", () => validateNoPastDue());

  /* ---------- time picker (friendly) ---------- */
  function setTimeValue(v) {
    const norm = normalizeTimeStr(v);
    tDueTimeHidden.value = norm;

    timeLabel.textContent = norm || "Select time";
    timeSelect.value = norm || "";
    timeManualInside.value = norm || "";

    btnClearTime.classList.toggle("hidden", !norm);

    // notify validators
    document.dispatchEvent(new Event("time-updated"));
  }

  document.addEventListener("time-updated", () => validateNoPastDue());

  function buildTimeOptions(stepMinutes = 5) {
    timeSelect.innerHTML = `<option value="" selected>Select time</option>`;

    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += stepMinutes) {
        const v = `${pad2(h)}:${pad2(m)}`;
        const d = new Date(`2000-01-01T${v}`);
        const label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = label;
        timeSelect.appendChild(opt);
      }
    }
  }

  function openTimeModal() {
    // prefill
    const cur = normalizeTimeStr(tDueTimeHidden.value);
    timeSelect.value = cur || "";
    timeManualInside.value = cur || "";

    timeModal.classList.remove("hidden");
    timeModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // focus for mobile
    setTimeout(() => timeSelect.focus(), 0);
  }

  function closeTimeModal() {
    timeModal.classList.add("hidden");
    timeModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  buildTimeOptions(5);
  setTimeValue(""); // initial

  btnOpenTime.addEventListener("click", openTimeModal);
  btnCloseTime.addEventListener("click", closeTimeModal);

  timeModal.addEventListener("click", (e) => {
    if (e.target === timeModal) closeTimeModal();
  });

  btnClearTime.addEventListener("click", () => setTimeValue(""));

  // manual: allow ONLY digits and colon, auto HH:MM format, max 5
  timeManualInside.setAttribute("maxlength", "5");
  timeManualInside.addEventListener("input", () => {
    let v = timeManualInside.value || "";
    v = v.replace(/[^\d:]/g, ""); // no letters
    // allow only one colon
    const parts = v.split(":");
    if (parts.length > 2) v = parts[0] + ":" + parts.slice(1).join("");
    // auto-insert colon after 2 digits (if not already)
    if (v.length === 2 && !v.includes(":")) v = v + ":";
    if (v.length > 5) v = v.slice(0, 5);
    timeManualInside.value = v;
  });

  timeSelect.addEventListener("change", () => {
    if (timeSelect.value) timeManualInside.value = timeSelect.value;
  });

  btnTimeNow.addEventListener("click", () => {
    const v = nowHHMM();
    timeManualInside.value = v;
    timeSelect.value = v;
  });

  btnTimeApply.addEventListener("click", () => {
    const manual = normalizeTimeStr(timeManualInside.value);
    if (manual) {
      setTimeValue(manual);
      closeTimeModal();
      return;
    }
    if (timeSelect.value) {
      setTimeValue(timeSelect.value);
      closeTimeModal();
      return;
    }
    // allow empty (no due time)
    setTimeValue("");
    closeTimeModal();
  });

  /* ---------- profile menu (3 dots) fixed positioning ---------- */
  function openProfileMenu() {
    if (!btnProfileMenu || !profileMenu) return;

    profileMenu.classList.remove("hidden");

    // ensure measurable
    profileMenu.style.position = "fixed";
    profileMenu.style.visibility = "hidden";
    profileMenu.style.left = "0px";
    profileMenu.style.top = "0px";
    profileMenu.style.zIndex = "999999";

    const btnRect = btnProfileMenu.getBoundingClientRect();
    const menuRect = profileMenu.getBoundingClientRect();

    // open above, align right edge to button
    let left = btnRect.right - menuRect.width;
    let top = btnRect.top - menuRect.height - 10;

    // if not enough space above, open below
    if (top < 10) top = btnRect.bottom + 10;

    left = clamp(left, 10, window.innerWidth - menuRect.width - 10);
    top = clamp(top, 10, window.innerHeight - menuRect.height - 10);

    profileMenu.style.left = `${left}px`;
    profileMenu.style.top = `${top}px`;
    profileMenu.style.visibility = "visible";
  }

  function closeProfileMenu() {
    if (!profileMenu) return;
    profileMenu.classList.add("hidden");
  }

  if (btnProfileMenu && profileMenu) {
    btnProfileMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      if (profileMenu.classList.contains("hidden")) openProfileMenu();
      else closeProfileMenu();
    });

    document.addEventListener("click", () => closeProfileMenu());
    window.addEventListener("resize", () => {
      if (!profileMenu.classList.contains("hidden")) openProfileMenu();
    });
    window.addEventListener(
      "scroll",
      () => {
        if (!profileMenu.classList.contains("hidden")) openProfileMenu();
      },
      true
    );
  }

  /* ---------- create / edit flow ---------- */
  function startCreate() {
    editingId = null;
    clearForm();
  }

  function startEdit(taskId) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;

    editingId = taskId;

    tTitle.value = t.title;
    tPriority.value = t.priority;
    tStatus.value = t.status;
    tDueDate.value = t.dueDate || "";
    tCategory.value = t.category || "";
    tNotes.value = t.notes || "";
    tProgress.value = clamp(Number(t.progress || 0), 0, 100);

    setTimeValue(t.dueTime || "");
  }

  function clearForm() {
    tTitle.value = "";
    tPriority.value = "med";
    tStatus.value = "todo";
    tDueDate.value = "";
    tCategory.value = "";
    tNotes.value = "";
    tProgress.value = 0;
    setTimeValue("");
  }

  /* ---------- save task ---------- */
  btnSaveTask.addEventListener("click", () => {
    const title = tTitle.value.trim();
    if (!title) {
      alert("Please enter a task title.");
      tTitle.focus();
      return;
    }

    // limit progress 0-100 and block past due
    let progress = clamp(Number(tProgress.value || 0), 0, 100);
    tProgress.value = progress;

    // If user chose dueDate, must not be in past
    if (!validateNoPastDue()) return;

    const taskData = {
      title,
      priority: tPriority.value,
      status: tStatus.value,
      dueDate: (tDueDate.value || "").trim(),
      dueTime: normalizeTimeStr(tDueTimeHidden.value),
      category: (tCategory.value || "").trim(),
      notes: (tNotes.value || "").trim(),
      progress,
      updatedAt: Date.now(),
    };

    if (editingId) {
      const idx = tasks.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        tasks[idx] = {
          ...tasks[idx],
          ...taskData,
        };
      }
    } else {
      tasks.unshift({
        id: uid(),
        ...taskData,
        createdAt: Date.now(),
      });
    }

    saveTasks();
    render();
    closeTaskModal();
  });

  /* ---------- filters ---------- */
  const onFilterChanged = () => render();

  searchInput.addEventListener("input", onFilterChanged);
  filterStatus.addEventListener("change", onFilterChanged);
  filterPriority.addEventListener("change", onFilterChanged);
  filterWhen.addEventListener("change", onFilterChanged);

  function applyFilters(list) {
    const q = (searchInput.value || "").trim().toLowerCase();
    const s = filterStatus.value;
    const p = filterPriority.value;
    const w = filterWhen.value;

    const now = new Date();

    return list.filter((t) => {
      if (q) {
        const hay =
          `${t.title} ${t.category} ${t.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (s !== "all" && t.status !== s) return false;
      if (p !== "all" && t.priority !== p) return false;

      if (w !== "all") {
        const d = dueAsDate(t);
        if (!d) return false;

        if (w === "today") {
          if (!isToday(t)) return false;
        } else if (w === "overdue") {
          if (!(d.getTime() < now.getTime())) return false;
        } else if (w === "upcoming") {
          if (d.getTime() < now.getTime()) return false;
        }
      }

      return true;
    });
  }

  /* ---------- task actions ---------- */
  function cyclePriority(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.priority = t.priority === "high" ? "med" : t.priority === "med" ? "low" : "high";
    t.updatedAt = Date.now();
    saveTasks();
    render();
  }

  function toggleDone(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.status = t.status === "done" ? "todo" : "done";
    if (t.status === "done") t.progress = 100;
    t.updatedAt = Date.now();
    saveTasks();
    render();
  }

  function removeTask(id) {
    tasks = tasks.filter((x) => x.id !== id);
    saveTasks();
    render();
  }

  function setProgress(id, val) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.progress = clamp(val, 0, 100);
    if (t.progress === 100) t.status = "done";
    t.updatedAt = Date.now();
    saveTasks();
    render();
  }

  /* ---------- render ---------- */
  function render() {
    // Sort: overdue first, then soonest due, then newest
    const sorted = [...tasks].sort((a, b) => {
      const ad = dueAsDate(a);
      const bd = dueAsDate(b);

      const ao = ad ? ad.getTime() < Date.now() : false;
      const bo = bd ? bd.getTime() < Date.now() : false;
      if (ao !== bo) return ao ? -1 : 1;

      if (ad && bd) return ad.getTime() - bd.getTime();
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;

      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    const filtered = applyFilters(sorted);

    tasksCount.textContent = `${filtered.length} task${filtered.length === 1 ? "" : "s"}`;

    tasksList.innerHTML = "";
    if (filtered.length === 0) {
      tasksEmpty.classList.remove("hidden");
      return;
    }
    tasksEmpty.classList.add("hidden");

    filtered.forEach((t) => {
      const overdue = isOverdue(t) && t.status !== "done";
      const dueTxt = formatDueDisplay(t);

      const card = document.createElement("div");
      card.className = "taskCard" + (overdue ? " overdue" : "") + (t.status === "done" ? " done" : "");

      // Build tag chips
      const catChip = t.category ? `<span class="chip tag"># ${escapeHtml(t.category)}</span>` : "";

      card.innerHTML = `
        <div class="taskTop">
          <div class="taskTitle">${escapeHtml(t.title)}</div>

          <div class="taskChips">
            <span class="chip prio ${t.priority}">${priorityLabel(t.priority)}</span>
            <span class="chip stat ${t.status}">${statusLabel(t.status)}</span>
            ${catChip}
          </div>
        </div>

        <div class="taskActions">
          <button class="iconBtn small" data-act="edit" title="Edit" aria-label="Edit">✎</button>
          <button class="iconBtn small" data-act="prio" title="Change priority" aria-label="Change priority">⚡</button>
          <button class="iconBtn small" data-act="done" title="${t.status === "done" ? "Mark as Todo" : "Mark as Done"}" aria-label="Toggle done">✅</button>
          <button class="iconBtn small" data-act="del" title="Delete" aria-label="Delete">🗑️</button>
        </div>

        ${t.notes ? `<div class="taskNotes">${escapeHtml(t.notes)}</div>` : ""}

        <div class="taskMetaRow">
          <div class="taskDue">${overdue ? "Overdue • " : ""}${escapeHtml(dueTxt)} <span class="pct">${t.progress}%</span></div>
        </div>

        <div class="taskProgress">
          <div class="pBar"><div class="pFill" style="width:${t.progress}%"></div></div>
          <div class="pChips">
            ${[0, 25, 50, 75, 100]
              .map(
                (v) =>
                  `<button class="pChip" data-prog="${v}" title="Set to ${v}%">${v}%</button>`
              )
              .join("")}
          </div>
        </div>
      `;

      // actions
      card.querySelector('[data-act="edit"]').addEventListener("click", () => {
        startEdit(t.id);
        openTaskModal();
      });

      card.querySelector('[data-act="prio"]').addEventListener("click", () => cyclePriority(t.id));
      card.querySelector('[data-act="done"]').addEventListener("click", () => toggleDone(t.id));

      card.querySelector('[data-act="del"]').addEventListener("click", () => {
        if (confirm("Delete this task?")) removeTask(t.id);
      });

      card.querySelectorAll(".pChip").forEach((btn) => {
        btn.addEventListener("mouseenter", () => {
          // your CSS can handle hover; this keeps it snappy if needed
          btn.classList.add("hovering");
        });
        btn.addEventListener("mouseleave", () => btn.classList.remove("hovering"));

        btn.addEventListener("click", () => {
          const v = Number(btn.getAttribute("data-prog"));
          setProgress(t.id, v);
        });
      });

      tasksList.appendChild(card);
    });
  }

  function escapeHtml(s) {
    return safeText(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ---------- ensure progress input limited ---------- */
  tProgress.addEventListener("input", () => {
    // keep only digits
    const v = String(tProgress.value || "").replace(/[^\d]/g, "");
    tProgress.value = v ? clamp(Number(v), 0, 100) : "";
  });

  tProgress.addEventListener("blur", () => {
    let v = Number(tProgress.value || 0);
    if (Number.isNaN(v)) v = 0;
    tProgress.value = clamp(v, 0, 100);
  });

  /* ---------- init render ---------- */
  render();
});

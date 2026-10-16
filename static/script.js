
const API = "/api/tasks";

const $ = (id) => document.getElementById(id);

let tasks = [];
let currentPage = 1;

const taskList = $("taskList");
const dialog = $("taskDialog");
const form = $("taskForm");
const message = $("message");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function showMessage(text, type = "success") {
  message.textContent = text;
  message.className = `message ${type}`;
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    message.textContent = "";
    message.className = "message";
  }, 3500);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function formatDate(value) {
  if (!value) return "—";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function priorityClass(priority) {
  return `priority-${String(priority || "Medium").toLowerCase()}`;
}

function statusClass(status) {
  return status === "Completed" ? "status-completed" : "status-pending";
}

function getFilteredTasks() {
  const search = $("search").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const priority = $("priorityFilter").value;

  return tasks.filter((task) => {
    const matchesSearch =
      `${task.title} ${task.description || ""}`.toLowerCase().includes(search);
    const matchesStatus = status === "All" || task.status === status;
    const matchesPriority = priority === "All" || task.priority === priority;
    return matchesSearch && matchesStatus && matchesPriority;
  });
}

function renderStats() {
  $("total").textContent = tasks.length;
  $("pending").textContent = tasks.filter(t => t.status !== "Completed").length;
  $("completed").textContent = tasks.filter(t => t.status === "Completed").length;
  $("overdue").textContent = tasks.filter(t => t.overdue).length;
}

function renderTasks() {
  const filtered = getFilteredTasks();
  const pageSize = Number($("rowsPerPage").value);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageTasks = filtered.slice(start, start + pageSize);

  $("pageInfo").textContent = filtered.length
    ? `Showing ${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length} tasks`
    : "Showing 0 tasks";

  $("prevPage").disabled = currentPage <= 1;
  $("nextPage").disabled = currentPage >= totalPages;

  if (!pageTasks.length) {
    taskList.innerHTML = `<tr><td colspan="6" class="empty-state">
      No tasks found. Click “Add New Task” to create one.
    </td></tr>`;
    return;
  }

  taskList.innerHTML = pageTasks.map(task => `
    <tr>
      <td>
        <div class="task-title">${escapeHTML(task.title)}</div>
        ${task.description ? `<div class="task-description">${escapeHTML(task.description)}</div>` : ""}
      </td>
      <td><span class="priority ${priorityClass(task.priority)}">${escapeHTML(task.priority || "Medium")}</span></td>
      <td><span class="status-badge ${statusClass(task.status)}">${task.status === "Completed" ? "Completed" : "In progress"}</span></td>
      <td>${formatDate(task.created_at)}</td>
      <td class="${task.overdue ? "overdue-text" : ""}">${formatDate(task.deadline)}${task.overdue ? " !" : ""}</td>
      <td>
        <div class="action-group">
          <button class="action-btn" data-action="toggle" data-id="${task.id}" title="${task.status === "Completed" ? "Reopen task" : "Mark completed"}" aria-label="Toggle task status">${task.status === "Completed" ? "↻" : "✓"}</button>
          <button class="action-btn" data-action="edit" data-id="${task.id}" title="Edit task" aria-label="Edit task">✎</button>
          <button class="action-btn delete" data-action="delete" data-id="${task.id}" title="Delete task" aria-label="Delete task">▤</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function loadTasks() {
  try {
    tasks = await request(API);
    renderStats();
    renderTasks();
  } catch (error) {
    taskList.innerHTML = `<tr><td colspan="6" class="empty-state">
      Could not load tasks: ${escapeHTML(error.message)}. Check that Flask is running.
    </td></tr>`;
    showMessage(error.message, "error");
  }
}

function openCreateDialog() {
  form.reset();
  $("taskId").value = "";
  $("dialogTitle").textContent = "Create a task";
  $("saveBtn").textContent = "Save Task";
  $("priority").value = "Medium";
  dialog.showModal();
  $("title").focus();
}

function openEditDialog(task) {
  form.reset();
  $("taskId").value = task.id;
  $("title").value = task.title || "";
  $("description").value = task.description || "";
  $("deadline").value = task.deadline || "";
  $("priority").value = task.priority || "Medium";
  $("dialogTitle").textContent = "Edit task";
  $("saveBtn").textContent = "Save Changes";
  dialog.showModal();
  $("title").focus();
}

$("newTaskBtn").addEventListener("click", openCreateDialog);
$("cancelBtn").addEventListener("click", () => dialog.close());
$("closeDialog").addEventListener("click", () => dialog.close());

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = $("taskId").value;
  const payload = {
    title: $("title").value.trim(),
    description: $("description").value.trim(),
    deadline: $("deadline").value,
    priority: $("priority").value
  };

  if (!payload.title) {
    showMessage("Please enter a task title.", "error");
    $("title").focus();
    return;
  }

  $("saveBtn").disabled = true;
  try {
    if (id) {
      const existing = tasks.find(task => String(task.id) === id);
      await request(`${API}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, status: existing?.status || "Pending" })
      });
      showMessage("Task updated successfully!");
    } else {
      await request(API, { method: "POST", body: JSON.stringify(payload) });
      showMessage("Task created successfully!");
    }
    dialog.close();
    currentPage = 1;
    await loadTasks();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    $("saveBtn").disabled = false;
  }
});

taskList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;
  const task = tasks.find(item => String(item.id) === id);
  if (!task) return;

  try {
    if (action === "edit") {
      openEditDialog(task);
      return;
    }

    if (action === "toggle") {
      const newStatus = task.status === "Completed" ? "Pending" : "Completed";
      await request(`${API}/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus })
      });
      showMessage(newStatus === "Completed" ? "Task completed!" : "Task reopened.");
    }

    if (action === "delete") {
      if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
      await request(`${API}/${id}`, { method: "DELETE" });
      showMessage("Task deleted successfully!");
    }

    await loadTasks();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

["search", "statusFilter", "priorityFilter", "rowsPerPage"].forEach(id => {
  $(id).addEventListener(id === "search" ? "input" : "change", () => {
    currentPage = 1;
    renderTasks();
  });
});

$("prevPage").addEventListener("click", () => {
  currentPage--;
  renderTasks();
});

$("nextPage").addEventListener("click", () => {
  currentPage++;
  renderTasks();
});

document.querySelectorAll(".nav-item[data-filter]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item[data-filter]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    $("statusFilter").value = button.dataset.filter;
    currentPage = 1;
    renderTasks();
  });
});

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const dark = document.body.classList.contains("dark");
  $("themeBtn").innerHTML = `<span>${dark ? "☀" : "☾"}</span> ${dark ? "Toggle light mode" : "Toggle dark mode"}`;
});

loadTasks();

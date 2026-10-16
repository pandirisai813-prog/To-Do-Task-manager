
from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import date

app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static"
)

DATABASE = "tasks.db"


# Connect to SQLite database
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


# Create database table
def init_db():
    conn = get_db_connection()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            deadline TEXT DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'Medium',
            status TEXT NOT NULL DEFAULT 'Pending',
            created_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


# Convert database row to JSON-compatible dictionary
def task_to_dict(task):
    item = dict(task)

    deadline = item["deadline"]
    item["overdue"] = bool(
        deadline
        and deadline < date.today().isoformat()
        and item["status"] != "Completed"
    )

    return item


# Home page
@app.route("/")
def home():
    return render_template("index.html")


# GET: View all tasks
# POST: Create a new task
@app.route("/api/tasks", methods=["GET", "POST"])
def tasks_api():

    if request.method == "GET":
        conn = get_db_connection()
        tasks = conn.execute(
            "SELECT * FROM tasks ORDER BY id DESC"
        ).fetchall()
        conn.close()

        return jsonify([task_to_dict(task) for task in tasks])

    data = request.get_json(silent=True) or {}

    title = str(data.get("title") or "").strip()
    description = str(data.get("description") or "").strip()
    deadline = str(data.get("deadline") or "").strip()
    priority = data.get("priority", "Medium")

    if not title:
        return jsonify({"error": "Task title is required."}), 400

    if priority not in ["Low", "Medium", "High"]:
        return jsonify({"error": "Invalid priority."}), 400

    if deadline:
        try:
            date.fromisoformat(deadline)
        except ValueError:
            return jsonify({"error": "Invalid deadline."}), 400

    conn = get_db_connection()

    cursor = conn.execute("""
        INSERT INTO tasks
        (title, description, deadline, priority, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        title,
        description,
        deadline,
        priority,
        "Pending",
        date.today().isoformat()
    ))

    conn.commit()

    task = conn.execute(
        "SELECT * FROM tasks WHERE id = ?",
        (cursor.lastrowid,)
    ).fetchone()

    conn.close()

    return jsonify(task_to_dict(task)), 201


# PUT: Update an existing task
@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):

    data = request.get_json(silent=True) or {}

    title = str(data.get("title") or "").strip()
    description = str(data.get("description") or "").strip()
    deadline = str(data.get("deadline") or "").strip()
    priority = data.get("priority", "Medium")
    status = data.get("status", "Pending")

    if not title:
        return jsonify({"error": "Task title is required."}), 400

    if priority not in ["Low", "Medium", "High"]:
        return jsonify({"error": "Invalid priority."}), 400

    if status not in ["Pending", "Completed"]:
        return jsonify({"error": "Invalid status."}), 400

    if deadline:
        try:
            date.fromisoformat(deadline)
        except ValueError:
            return jsonify({"error": "Invalid deadline."}), 400

    conn = get_db_connection()

    existing = conn.execute(
        "SELECT id FROM tasks WHERE id = ?",
        (task_id,)
    ).fetchone()

    if existing is None:
        conn.close()
        return jsonify({"error": "Task not found."}), 404

    conn.execute("""
        UPDATE tasks
        SET title = ?, description = ?, deadline = ?,
            priority = ?, status = ?
        WHERE id = ?
    """, (title, description, deadline, priority, status, task_id))

    conn.commit()

    task = conn.execute(
        "SELECT * FROM tasks WHERE id = ?",
        (task_id,)
    ).fetchone()

    conn.close()

    return jsonify(task_to_dict(task))


# PATCH: Change task status
@app.route("/api/tasks/<int:task_id>/status", methods=["PATCH"])
def update_status(task_id):

    data = request.get_json(silent=True) or {}
    status = data.get("status")

    if status not in ["Pending", "Completed"]:
        return jsonify({"error": "Invalid task status."}), 400

    conn = get_db_connection()

    cursor = conn.execute(
        "UPDATE tasks SET status = ? WHERE id = ?",
        (status, task_id)
    )

    conn.commit()

    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"error": "Task not found."}), 404

    task = conn.execute(
        "SELECT * FROM tasks WHERE id = ?",
        (task_id,)
    ).fetchone()

    conn.close()

    return jsonify(task_to_dict(task))


# DELETE: Remove a task
@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):

    conn = get_db_connection()

    cursor = conn.execute(
        "DELETE FROM tasks WHERE id = ?",
        (task_id,)
    )

    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        return jsonify({"error": "Task not found."}), 404

    return jsonify({"message": "Task deleted successfully."})

import os

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 10000))
    )

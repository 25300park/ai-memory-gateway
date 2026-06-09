const MEMORY_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  ARCHIVED: "archived"
};

const QUEUE_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed"
};

const PROJECT_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  ARCHIVED: "archived"
};

const TASK_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

function isValidMemoryStatus(status) {
  return Object.values(MEMORY_STATUS).includes(status);
}

function isValidQueueStatus(status) {
  return Object.values(QUEUE_STATUS).includes(status);
}

function isValidProjectStatus(status) {
  return Object.values(PROJECT_STATUS).includes(status);
}

function isValidTaskStatus(status) {
  return Object.values(TASK_STATUS).includes(status);
}

module.exports = {
  MEMORY_STATUS,
  QUEUE_STATUS,
  PROJECT_STATUS,
  TASK_STATUS,
  isValidMemoryStatus,
  isValidQueueStatus,
  isValidProjectStatus,
  isValidTaskStatus
};
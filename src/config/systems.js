// Phase 23-1: static registry of the systems the task board can file items against.
// Deliberately not a DB table - this is a small, rarely-changing list, and keeping it as
// code means adding a system is a normal reviewed diff instead of a manual DB write.
const SYSTEMS = {
  ai_memory_gateway: {
    display_name: "AI Memory Gateway",
    repo_path: "D:\\00. Ai_Memory_System\\api"
  },
  rbs_homes: {
    display_name: "RBS-HOMES",
    repo_path: "D:\\01. RBS-HOMES Backup\\01. RBS-HOMES"
  },
  rbs_homes_admin: {
    display_name: "RBS-HOMES Admin",
    repo_path: "D:\\01. RBS-HOMES Backup\\02. ADMIN-RBS-HOMES"
  }
};

module.exports = SYSTEMS;

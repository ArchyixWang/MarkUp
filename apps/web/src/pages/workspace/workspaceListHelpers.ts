export const workspacePopupContainer = (trigger: HTMLElement) =>
  (trigger.closest('.workspace-fixed-toolbar') as HTMLElement | null)
  ?? (trigger.closest('.page-heading-actions') as HTMLElement | null)
  ?? trigger.parentElement
  ?? document.body;

export function fixedTablePagination(total: number, pageSize = 10) {
  return {
    pageSize,
    total: total || 1,
    showSizeChanger: true,
    showQuickJumper: true,
    placement: ['bottomEnd' as const],
    showTotal: () => `共 ${total} 条`,
  };
}

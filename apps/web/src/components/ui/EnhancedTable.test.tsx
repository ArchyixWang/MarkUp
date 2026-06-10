import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EnhancedTable } from './EnhancedTable';

type RowItem = {
  key: string;
  name: string;
};

const columns: ColumnsType<RowItem> = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
    width: 180,
  },
];

const dataSource = Array.from({ length: 24 }, (_, index) => ({
  key: `row-${index + 1}`,
  name: `第 ${index + 1} 项`,
}));

describe('EnhancedTable', () => {
  it('applies changed page size when using static pagination config', async () => {
    const user = userEvent.setup();

    render(
      <EnhancedTable<RowItem>
        rowKey="key"
        columns={columns}
        dataSource={dataSource}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
        }}
      />,
    );

    expect(screen.getByText('第 10 项')).toBeInTheDocument();
    expect(screen.queryByText('第 11 项')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Page Size' }));
    await user.click(await screen.findByTitle('20 / page'));

    await waitFor(() => {
      expect(screen.getByText('第 20 项')).toBeInTheDocument();
    });
    expect(screen.queryByText('第 21 项')).not.toBeInTheDocument();
  });

  it('does not apply resizable width styles to generated selection columns', () => {
    const { container } = render(
      <EnhancedTable<RowItem>
        rowKey="key"
        className="workspace-fixed-table"
        columns={[
          Table.SELECTION_COLUMN as ColumnsType<RowItem>[number],
          {
            title: '任务名称',
            dataIndex: 'name',
            key: 'name',
            width: 320,
            fixed: 'left',
          },
        ]}
        dataSource={dataSource.slice(0, 1)}
        rowSelection={{ fixed: true, columnWidth: 48 }}
        scroll={{ x: 480 }}
      />,
    );

    const selectionHeader = container.querySelector<HTMLTableCellElement>('th.ant-table-selection-column');
    const nameHeader = screen.getByRole('columnheader', { name: /任务名称/ });

    expect(selectionHeader).not.toBeNull();
    expect(selectionHeader).not.toHaveStyle({ minWidth: '96px' });
    expect(nameHeader).toHaveStyle({ minWidth: '96px' });
  });
});

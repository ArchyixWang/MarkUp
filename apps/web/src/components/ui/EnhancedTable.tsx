import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Table } from 'antd';
import type { ColumnType, ColumnsType, TablePaginationConfig, TableProps } from 'antd/es/table';

type ResizableHeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  as?: React.ElementType;
  width?: number;
  minWidth?: number;
  onResizeWidth?: (nextWidth: number) => void;
};

type TableColumnWidthState = Record<string, number>;

export type EnhancedTableProps<RecordType extends object> = TableProps<RecordType> & {
  defaultResizableWidth?: number;
  enableColumnResize?: boolean;
  minResizableWidth?: number;
};

export function EnhancedTable<RecordType extends object>({
  columns,
  components,
  defaultResizableWidth = 180,
  enableColumnResize = true,
  minResizableWidth = 96,
  scroll,
  showSorterTooltip = { target: 'sorter-icon' },
  sticky,
  tableLayout = 'fixed',
  className,
  ...restProps
}: EnhancedTableProps<RecordType>) {
  const [columnWidths, setColumnWidths] = useState<TableColumnWidthState>({});
  const paginationConfig = restProps.pagination;
  const paginationEnabled = paginationConfig !== false;
  const normalizedPagination = paginationEnabled && paginationConfig
    ? paginationConfig
    : paginationEnabled
      ? {}
      : false;
  const [paginationState, setPaginationState] = useState(() =>
    getInitialPaginationState(normalizedPagination),
  );

  useEffect(() => {
    if (!paginationEnabled) {
      return;
    }
    setPaginationState((current) => syncPaginationState(current, normalizedPagination));
  }, [normalizedPagination, paginationEnabled]);

  const mergedColumns = useMemo(
    () =>
      enableColumnResize
        ? buildResizableColumns({
            columns: columns ?? [],
            columnWidths,
            defaultResizableWidth,
            minResizableWidth,
            onResize: (columnKey, nextWidth) =>
              setColumnWidths((current) =>
                current[columnKey] === nextWidth
                  ? current
                  : {
                      ...current,
                      [columnKey]: nextWidth,
                    },
              ),
          })
        : columns,
    [columnWidths, columns, defaultResizableWidth, enableColumnResize, minResizableWidth],
  );

  const mergedComponents = useMemo(() => {
    if (!enableColumnResize) {
      return components;
    }

    const existingHeaderCell = components?.header?.cell;

    return {
      ...components,
      header: {
        ...components?.header,
        cell: existingHeaderCell
          ? (cellProps: ResizableHeaderCellProps) => (
              <ResizableHeaderCell {...cellProps} as={existingHeaderCell} />
            )
          : ResizableHeaderCell,
      },
    };
  }, [components, enableColumnResize]);

  const mergedScroll = useMemo(() => {
    if (!scroll) {
      return { x: 'max-content' as const };
    }

    if (typeof scroll === 'object' && !Array.isArray(scroll)) {
      return {
        ...scroll,
        x: scroll.x ?? ('max-content' as const),
      };
    }

    return scroll;
  }, [scroll]);

  const mergedPagination = useMemo<TableProps<RecordType>['pagination']>(() => {
    if (!paginationEnabled) {
      return false;
    }

    const baseConfig = normalizedPagination && typeof normalizedPagination === 'object'
      ? normalizedPagination
      : {};
    const controlledCurrent = typeof baseConfig.current === 'number';
    const controlledPageSize = typeof baseConfig.pageSize === 'number' && typeof baseConfig.onChange === 'function';

    return {
      ...baseConfig,
      current: controlledCurrent ? baseConfig.current : paginationState.current,
      pageSize: controlledPageSize ? baseConfig.pageSize : paginationState.pageSize,
      onChange: (page, pageSize) => {
        setPaginationState((current) => ({
          current: page,
          pageSize: pageSize ?? current.pageSize,
        }));
        baseConfig.onChange?.(page, pageSize);
      },
      onShowSizeChange: (current, size) => {
        setPaginationState({
          current: 1,
          pageSize: size,
        });
        baseConfig.onShowSizeChange?.(current, size);
      },
    };
  }, [normalizedPagination, paginationEnabled, paginationState]);

  const resolvedSticky = sticky ?? (typeof className === 'string' && className.includes('workspace-fixed-table'));

  return (
    <Table<RecordType>
      {...restProps}
      className={className}
      columns={mergedColumns}
      components={mergedComponents}
      pagination={mergedPagination}
      scroll={mergedScroll}
      showSorterTooltip={showSorterTooltip}
      sticky={resolvedSticky}
      tableLayout={tableLayout}
    />
  );
}

function getInitialPaginationState(
  pagination: false | TablePaginationConfig | undefined,
): { current: number; pageSize: number } {
  if (!pagination || typeof pagination !== 'object') {
    return { current: 1, pageSize: 10 };
  }

  return {
    current: pagination.current ?? 1,
    pageSize: pagination.pageSize ?? 10,
  };
}

function syncPaginationState(
  current: { current: number; pageSize: number },
  pagination: false | TablePaginationConfig | undefined,
) {
  if (!pagination || typeof pagination !== 'object') {
    return current;
  }

  const nextCurrent = typeof pagination.current === 'number' ? pagination.current : current.current;
  const nextPageSize = typeof pagination.pageSize === 'number' && typeof pagination.onChange === 'function'
    ? pagination.pageSize
    : current.pageSize;

  if (nextCurrent === current.current && nextPageSize === current.pageSize) {
    return current;
  }

  return {
    current: nextCurrent,
    pageSize: nextPageSize,
  };
}

function buildResizableColumns<RecordType extends object>({
  columns,
  columnWidths,
  defaultResizableWidth,
  minResizableWidth,
  onResize,
  parentKey,
}: {
  columns: ColumnsType<RecordType>;
  columnWidths: TableColumnWidthState;
  defaultResizableWidth: number;
  minResizableWidth: number;
  onResize: (columnKey: string, nextWidth: number) => void;
  parentKey?: string;
}): ColumnsType<RecordType> {
  return columns.map((column, index) => {
    if (column === Table.SELECTION_COLUMN || column === Table.EXPAND_COLUMN) {
      return column;
    }

    const columnKey = getResizableColumnKey(column, index, parentKey);

    if ('children' in column && column.children?.length) {
      return {
        ...column,
        children: buildResizableColumns({
          columns: column.children,
          columnWidths,
          defaultResizableWidth,
          minResizableWidth,
          onResize,
          parentKey: columnKey,
        }),
      };
    }

    const baseWidth = typeof column.width === 'number' ? column.width : defaultResizableWidth;
    const width = columnWidths[columnKey] ?? baseWidth;
    const nextMinWidth = Math.min(Math.max(minResizableWidth, 72), baseWidth);
    const originalOnHeaderCell = column.onHeaderCell;

    return {
      ...column,
      width,
      onHeaderCell: (record) => ({
        ...(originalOnHeaderCell?.(record) ?? {}),
        width,
        minWidth: nextMinWidth,
        onResizeWidth: (nextWidth: number) => onResize(columnKey, nextWidth),
      }),
    };
  });
}

function getResizableColumnKey<RecordType extends object>(
  column: ColumnType<RecordType>,
  index: number,
  parentKey?: string,
): string {
  const selfKey =
    column.key !== undefined && column.key !== null
      ? String(column.key)
      : Array.isArray(column.dataIndex)
        ? column.dataIndex.join('.')
        : column.dataIndex !== undefined && column.dataIndex !== null
          ? String(column.dataIndex)
          : `column-${index}`;

  return parentKey ? `${parentKey}:${selfKey}` : selfKey;
}

function ResizableHeaderCell({
  as: HeaderCell = 'th',
  width,
  minWidth = 96,
  onResizeWidth,
  style,
  children,
  ...restProps
}: ResizableHeaderCellProps) {
  if (!onResizeWidth) {
    return (
      <HeaderCell {...restProps} style={style}>
        {children}
      </HeaderCell>
    );
  }

  const HeaderCellComponent = HeaderCell as React.ElementType<React.ThHTMLAttributes<HTMLTableCellElement>>;
  const handleMouseDown = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = Math.max(width ?? minWidth, minWidth);
    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
      onResizeWidth(nextWidth);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  const fixedHeaderCell = typeof restProps.className === 'string' && restProps.className.includes('ant-table-cell-fix');
  const headerStyle: React.CSSProperties = {
    ...style,
    width,
    minWidth,
    maxWidth: width,
  };
  if (!fixedHeaderCell) {
    headerStyle.position = style?.position ?? 'relative';
  }

  return (
    <HeaderCellComponent
      {...restProps}
      style={headerStyle}
    >
      <div style={{ position: 'relative', paddingRight: 14 }}>
        {children}
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整列宽"
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            top: 0,
            right: -7,
            width: 14,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 1,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              right: 6,
              width: 2,
              height: 18,
              transform: 'translateY(-50%)',
              borderRadius: 999,
              background: 'rgba(5, 5, 5, 0.12)',
            }}
          />
        </span>
      </div>
    </HeaderCellComponent>
  );
}

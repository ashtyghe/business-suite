import { useState, useCallback } from 'react';

export function useKanbanDnD(onDrop) {
  const [dragItemId, setDragItemId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const handleDragStart = useCallback((e, itemId) => {
    setDragItemId(String(itemId));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(itemId));
    // Make the drag image slightly transparent
    if (e.target) {
      requestAnimationFrame(() => {
        e.target.style.opacity = '0.4';
      });
    }
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (e.target) e.target.style.opacity = '';
    setDragOverCol(null);
    setDragItemId(null);
  }, []);

  const handleDragOver = useCallback((e, col) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(col);
  }, []);

  const handleDragLeave = useCallback((e) => {
    // Only clear if leaving the column element itself
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(null);
    }
  }, []);

  const handleDrop = useCallback((e, col) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    setDragOverCol(null);
    setDragItemId(null);
    if (itemId && onDrop) {
      onDrop(itemId, col);
    }
  }, [onDrop]);

  const cardDragProps = useCallback((itemId) => ({
    draggable: true,
    onDragStart: (e) => handleDragStart(e, itemId),
    onDragEnd: handleDragEnd,
  }), [handleDragStart, handleDragEnd]);

  const colDragProps = useCallback((col) => ({
    onDragOver: (e) => handleDragOver(e, col),
    onDragLeave: handleDragLeave,
    onDrop: (e) => handleDrop(e, col),
  }), [handleDragOver, handleDragLeave, handleDrop]);

  return { dragItemId, dragOverCol, cardDragProps, colDragProps };
}

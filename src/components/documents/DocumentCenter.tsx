import React, { useState, useEffect } from 'react';
import { AttachmentService } from '../../domain/services/AttachmentService';
import { useAuth } from '../../hooks/useAuth';
import { FileAttachment } from '../../types/entities/audit';
import { Search, Filter, FolderOpen, Calendar, AlertCircle } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AttachmentList } from './AttachmentList';

export function DocumentCenter() {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('ALL');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('ALL');
  
  const { user } = useAuth();
  const attachmentService = new AttachmentService();

  useEffect(() => {
    fetchDocuments();
  }, [user]);

  const fetchDocuments = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const all = await attachmentService.findAll(user.companyId);
      // Sort by newest first
      setAttachments(all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  };

  const filteredAttachments = attachments.filter(att => {
    const matchesSearch = 
      att.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (att.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      att.entityId.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesEntity = entityTypeFilter === 'ALL' || att.entityType === entityTypeFilter;
    const matchesDoc = documentTypeFilter === 'ALL' || att.documentType === documentTypeFilter;
    
    return matchesSearch && matchesEntity && matchesDoc && !att.isArchived;
  });

  const entityTypes = Array.from(new Set(attachments.map(a => a.entityType).filter(Boolean)));
  const docTypes = Array.from(new Set(attachments.map(a => a.documentType).filter(Boolean)));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Central de Documentos</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie todos os arquivos e anexos do sistema em um só lugar.</p>
        </div>
      </div>

      <Card>
        <div className='p-4 border-b font-semibold text-lg'>Filtros de Busca</div>
        <div className='p-4'>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Nome do arquivo, ID..." 
                  className="pl-9"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Módulo (Entidade)</label>
              <Select value={entityTypeFilter} onChange={e => setEntityTypeFilter(e.target.value)}>
                <option value="ALL">Todos os Módulos</option>
                {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Documento</label>
              <Select value={documentTypeFilter} onChange={e => setDocumentTypeFilter(e.target.value)}>
                <option value="ALL">Todos os Tipos</option>
                {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className='p-4 border-b font-semibold text-lg'>Resultados ({filteredAttachments.length})</div>
        <div className='p-4'>
          {loading ? (
            <div className="text-center py-10 text-gray-500">Carregando documentos...</div>
          ) : error ? (
            <div className="text-center py-10 text-red-500">{error}</div>
          ) : (
            <AttachmentList 
              attachments={filteredAttachments} 
              onRefresh={fetchDocuments}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

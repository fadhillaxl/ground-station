import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VideocamIcon from '@mui/icons-material/Videocam';
import { useSocket } from '../common/socket.jsx';
import {
  fetchCameras,
  deleteCameras,
  submitOrEditCamera,
  setOpenAddDialog,
  setCurrentCamera,
} from './camera-slice.jsx';

export default function CameraTable() {
  const dispatch = useDispatch();
  const { socket } = useSocket();
  const { list: cameras, loading, openAddDialog, currentCamera } = useSelector(
    (state) => state.cameras || { list: [], loading: false, openAddDialog: false, currentCamera: {} }
  );

  const [selectedIds, setSelectedIds] = useState([]);
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    url: '/cctv/index.m3u8',
    type: 'hls',
    status: 'active',
  });

  useEffect(() => {
    if (socket) {
      dispatch(fetchCameras({ socket }));
    }
  }, [dispatch, socket]);

  useEffect(() => {
    if (currentCamera) {
      setFormData({
        id: currentCamera.id || null,
        name: currentCamera.name || '',
        url: currentCamera.url || '/cctv/index.m3u8',
        type: currentCamera.type || 'hls',
        status: currentCamera.status || 'active',
      });
    }
  }, [currentCamera]);

  const handleOpenAdd = () => {
    dispatch(
      setCurrentCamera({
        id: null,
        name: '',
        url: '/cctv/index.m3u8',
        type: 'hls',
        status: 'active',
      })
    );
    dispatch(setOpenAddDialog(true));
  };

  const handleOpenEdit = (camera) => {
    dispatch(setCurrentCamera(camera));
    dispatch(setOpenAddDialog(true));
  };

  const handleCloseDialog = () => {
    dispatch(setOpenAddDialog(false));
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.url) return;
    dispatch(submitOrEditCamera({ socket, formValues: formData }));
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} camera(s)?`)) {
      dispatch(deleteCameras({ socket, selectedIds }));
      setSelectedIds([]);
    }
  };

  const columns = [
    { field: 'name', headerName: 'Camera Name', flex: 1, minWidth: 150 },
    {
      field: 'url',
      headerName: 'Stream URL / RTSP IP',
      flex: 2,
      minWidth: 250,
      renderCell: (params) => (
        <Typography
          variant="caption"
          sx={{ fontFamily: 'monospace', color: '#00f3ff', wordBreak: 'break-all' }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={String(params.value || 'HLS').toUpperCase()}
          size="small"
          variant="outlined"
          color="primary"
        />
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={String(params.value || 'Active').toUpperCase()}
          size="small"
          color={params.value === 'active' ? 'success' : 'default'}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Tooltip title="Edit Camera">
          <IconButton size="small" onClick={() => handleOpenEdit(params.row)} color="primary">
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Paper elevation={3} sx={{ p: 2, borderRadius: 0, bgcolor: 'background.paper' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <VideocamIcon color="primary" /> IP Camera & CCTV Streams
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            size="small"
          >
            Add Camera
          </Button>
          {selectedIds.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDeleteSelected}
              size="small"
            >
              Delete ({selectedIds.length})
            </Button>
          )}
        </Stack>
      </Stack>

      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid
          rows={cameras}
          columns={columns}
          loading={loading}
          checkboxSelection
          onRowSelectionModelChange={(newSelection) => setSelectedIds(newSelection)}
          density="comfortable"
          pageSizeOptions={[5, 10, 25]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
        />
      </Box>

      {/* Add / Edit Camera Dialog */}
      <Dialog open={openAddDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <form onSubmit={handleSave}>
          <DialogTitle sx={{ fontWeight: 'bold' }}>
            {formData.id ? 'Edit Camera Configuration' : 'Add IP Camera Stream'}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                label="Camera Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                fullWidth
                placeholder="e.g. Main Entrance Camera"
                helperText="Enter a friendly label for this camera feed"
              />

              <TextField
                label="Stream URL / IP Address"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
                fullWidth
                placeholder="/cctv/index.m3u8 or http://192.168.1.100:8080/index.m3u8"
                helperText="HLS stream URL or RTSP server endpoint"
              />

              <FormControl fullWidth>
                <InputLabel id="camera-type-label">Stream Type</InputLabel>
                <Select
                  labelId="camera-type-label"
                  value={formData.type}
                  label="Stream Type"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <MenuItem value="hls">HLS (.m3u8)</MenuItem>
                  <MenuItem value="mjpeg">MJPEG Stream</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="camera-status-label">Status</InputLabel>
                <Select
                  labelId="camera-status-label"
                  value={formData.status}
                  label="Status"
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={handleCloseDialog} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary">
              {formData.id ? 'Save Changes' : 'Add Camera'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Paper>
  );
}

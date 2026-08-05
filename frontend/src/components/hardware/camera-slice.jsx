import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchCameras = createAsyncThunk(
    'cameras/fetchAll',
    async ({ socket }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit("api.call", {
                    cmd: 'get-cameras',
                    data: null
                }, response => {
                    if (response && response.success) {
                        resolve(response.data || []);
                    } else {
                        reject(new Error('Failed to fetch cameras'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const deleteCameras = createAsyncThunk(
    'cameras/deleteCameras',
    async ({ socket, selectedIds }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit("api.call", {
                    cmd: 'delete-camera',
                    data: selectedIds
                }, response => {
                    if (response && response.success) {
                        resolve(response.data || []);
                    } else {
                        reject(new Error('Failed to delete camera'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const submitOrEditCamera = createAsyncThunk(
    'cameras/submitOrEdit',
    async ({ socket, formValues }, { rejectWithValue, dispatch }) => {
        const action = formValues.id ? 'edit-camera' : 'submit-camera';
        try {
            return await new Promise((resolve, reject) => {
                socket.emit("api.call", {
                    cmd: action,
                    data: formValues
                }, response => {
                    if (response && response.success) {
                        dispatch(setOpenAddDialog(false));
                        resolve(response.data || []);
                    } else {
                        reject(new Error(`Failed to ${action === 'edit-camera' ? 'edit' : 'add'} camera`));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const defaultCamera = {
    id: null,
    name: '',
    url: '/cctv/index.m3u8',
    type: 'hls',
    status: 'active'
};

const cameraSlice = createSlice({
    name: 'cameras',
    initialState: {
        list: [],
        loading: false,
        error: null,
        openAddDialog: false,
        currentCamera: defaultCamera,
    },
    reducers: {
        setOpenAddDialog: (state, action) => {
            state.openAddDialog = action.payload;
            if (!action.payload) {
                state.currentCamera = defaultCamera;
            }
        },
        setCurrentCamera: (state, action) => {
            state.currentCamera = action.payload;
        },
        resetCurrentCamera: (state) => {
            state.currentCamera = defaultCamera;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchCameras.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchCameras.fulfilled, (state, action) => {
                state.loading = false;
                state.list = action.payload;
            })
            .addCase(fetchCameras.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(deleteCameras.fulfilled, (state, action) => {
                state.list = action.payload;
            })
            .addCase(submitOrEditCamera.fulfilled, (state, action) => {
                state.list = action.payload;
            });
    }
});

export const { setOpenAddDialog, setCurrentCamera, resetCurrentCamera } = cameraSlice.actions;
export default cameraSlice.reducer;

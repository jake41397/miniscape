import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayerData extends Document {
  userId?: mongoose.Types.ObjectId; // Make userId optional in the interface
  username?: string; // Add username to the interface
  x: number;
  y: number;
  z: number;
  level: number;
  experience: number;
  gold: number;
  inventory: any[]; // Using any[] for flexibility, but could be more strictly typed
  stats: Record<string, any>;
  isTemporary: boolean;
  sessionId?: string;
  lastActive?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PlayerDataSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: function(this: any) { 
      return this.isTemporary === false; // Only required for non-temporary users
    },
    index: true
  },
  username: {
    type: String,
    trim: true,
    index: true
  },
  x: {
    type: Number,
    required: true,
    default: 0
  },
  y: {
    type: Number,
    required: true,
    default: 1
  },
  z: {
    type: Number,
    required: true,
    default: 0
  },
  level: {
    type: Number,
    required: true,
    default: 1
  },
  experience: {
    type: Number,
    required: true,
    default: 0
  },
  gold: {
    type: Number,
    required: true,
    default: 0
  },
  inventory: {
    type: Schema.Types.Mixed, // Using Mixed for flexibility
    required: true,
    default: []
  },
  stats: {
    type: Schema.Types.Mixed, // Using Mixed for flexible JSON
    required: true,
    default: {}
  },
  isTemporary: {
    type: Boolean,
    default: false
  },
  sessionId: {
    type: String,
    sparse: true,
    unique: true
  },
  lastActive: {
    type: Date
  }
}, {
  timestamps: true
});

// Create indexes for efficient queries
PlayerDataSchema.index({ isTemporary: 1 });
PlayerDataSchema.index({ lastActive: 1 }); // Keep the index for query efficiency but remove auto-expiration

export default mongoose.model<IPlayerData>('PlayerData', PlayerDataSchema); 
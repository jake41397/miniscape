import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayerData extends Document {
  userId?: mongoose.Types.ObjectId; // Make userId optional in the interface
  username?: string; // Add username to the interface
  x: number;
  y: number;
  z: number;
  gold: number;
  inventory: any[]; // Using any[] for flexibility, but could be more strictly typed
  skills: { [skillName: string]: { level: number; experience: number } };
  isTemporary: boolean;
  sessionId?: string;
  lastActive?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Define default skills
const defaultSkills = {
  attack: { level: 1, experience: 0 },
  strength: { level: 1, experience: 0 },
  defence: { level: 1, experience: 0 },
  hitpoints: { level: 1, experience: 0 }, // Should HP start at 1 or 10? Assuming 1 for now based on level 1.
  ranged: { level: 1, experience: 0 },
  magic: { level: 1, experience: 0 },
  cooking: { level: 1, experience: 0 },
  woodcutting: { level: 1, experience: 0 },
  fishing: { level: 1, experience: 0 },
  mining: { level: 1, experience: 0 },
  smithing: { level: 1, experience: 0 }
};

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
  skills: {
    type: Map, // Using Map for flexibility in skill names
    of: new Schema({
        level: { type: Number, default: 1 },
        experience: { type: Number, default: 0 }
    }),
    required: true,
    default: defaultSkills
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
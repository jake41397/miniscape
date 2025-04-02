import mongoose, { Schema, Document } from 'mongoose';

export interface IProfile extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

const ProfileSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 32
  },
  avatarUrl: {
    type: String
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Create indexes for efficient queries
// Removed duplicate indexes for userId and username since they're already defined as unique in the schema

export default mongoose.model<IProfile>('Profile', ProfileSchema); 
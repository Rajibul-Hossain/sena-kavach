import tensorflow as tf
from tensorflow.keras import layers, models

# Hyperparameters
IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 50 # Set max limit to 50
DATASET_DIR = r"D:\Local Disk\Codes\DEFENCE\software_2\ai_model\dataset"

print("[SYSTEM] Initializing tf-nightly Vision Pipeline with Callbacks...")

# Load Dataset
train_ds = tf.keras.preprocessing.image_dataset_from_directory(
    DATASET_DIR,
    validation_split=0.2,
    subset="training",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode='categorical'
)

val_ds = tf.keras.preprocessing.image_dataset_from_directory(
    DATASET_DIR,
    validation_split=0.2,
    subset="validation",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode='categorical'
)

# Build Model
base_model = tf.keras.applications.MobileNetV2(
    input_shape=(224, 224, 3),
    include_top=False,
    weights='imagenet'
)
base_model.trainable = False 

model = models.Sequential([
    layers.Input(shape=(224, 224, 3)),
    layers.Rescaling(1./255),
    base_model,
    layers.GlobalAveragePooling2D(),
    layers.Dropout(0.3), # Increased slightly to prevent overfitting over longer epochs
    layers.Dense(64, activation='relu'),
    layers.Dense(4, activation='softmax', name='vision_output')
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

# --- TACTICAL CALLBACKS ENGINE ---
EXPORT_PATH = 'sena_vision_engine.keras'

callbacks = [
    # 1. Stop early if model stops learning
    tf.keras.callbacks.EarlyStopping(
        monitor='val_loss',
        patience=6,
        restore_best_weights=True,
        verbose=1
    ),
    # 2. Drop learning rate when plateauing
    tf.keras.callbacks.ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.2,
        patience=3,
        min_lr=1e-6,
        verbose=1
    ),
    # 3. Save only the best performing checkpoint
    tf.keras.callbacks.ModelCheckpoint(
        filepath=EXPORT_PATH,
        monitor='val_loss',
        save_best_only=True,
        verbose=1
    )
]

# Train Engine
print("[TRAIN] Initiating Callback-Driven Neural Training...")
history = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS,
    callbacks=callbacks
)

print(f"[SUCCESS] Best checkpoint automatically secured to '{EXPORT_PATH}'")